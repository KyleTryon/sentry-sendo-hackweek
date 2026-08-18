import tempfile
from pathlib import Path
from unittest import mock

from sentry.features.base import OrganizationFeature
from sentry.features.dev_flagpole_handler import (
    ENV_VAR,
    DevFlagpoleFeatureHandler,
    is_enabled,
    register_if_enabled,
)
from sentry.features.manager import FeatureManager
from sentry.testutils.cases import TestCase

FEATURE = "organizations:experiment-logs-cta"


def write_config(directory: Path, rollout: int, experiment_mode: str | None = "simple") -> str:
    mode_line = f"    experiment_mode: {experiment_mode}\n" if experiment_mode else ""
    path = directory / "flagpole.yaml"
    path.write_text(
        "options:\n"
        f"  feature.{FEATURE}:\n"
        "    enabled: true\n"
        "    owner:\n"
        "      team: sendo\n"
        "    created_at: '2026-08-18T00:00:00.000000+00:00'\n"
        f"{mode_line}"
        "    segments:\n"
        "      - name: local\n"
        f"        rollout: {rollout}\n"
        "        conditions: []\n"
    )
    return str(path)


class DevFlagpoleRegistrationTest(TestCase):
    """
    add_entity_handler assigns a single slot, so a dev handler that registered
    when it should not would silently displace getsentry's in a real environment.
    """

    def test_does_not_register_when_env_var_is_unset(self) -> None:
        manager = FeatureManager()
        with mock.patch.dict("os.environ", {}, clear=True):
            assert is_enabled() is False
            assert register_if_enabled(manager) is False
        assert manager._entity_handler is None

    def test_does_not_register_for_values_other_than_one(self) -> None:
        for value in ("0", "true", "yes", ""):
            manager = FeatureManager()
            with mock.patch.dict("os.environ", {ENV_VAR: value}, clear=True):
                assert register_if_enabled(manager) is False
            assert manager._entity_handler is None

    def test_registers_when_enabled(self) -> None:
        manager = FeatureManager()
        with mock.patch.dict("os.environ", {ENV_VAR: "1"}, clear=True):
            assert register_if_enabled(manager) is True
        assert isinstance(manager._entity_handler, DevFlagpoleFeatureHandler)

    def test_never_displaces_an_existing_entity_handler(self) -> None:
        manager = FeatureManager()
        existing = mock.Mock()
        manager.add_entity_handler(existing)

        with mock.patch.dict("os.environ", {ENV_VAR: "1"}, clear=True):
            assert register_if_enabled(manager) is False

        assert manager._entity_handler is existing


class DevFlagpoleEvaluationTest(TestCase):
    def setUp(self) -> None:
        super().setUp()
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        self.tmp_path = Path(self._tmp.name)

    def handler(self, rollout: int, experiment_mode: str | None = "simple"):
        return DevFlagpoleFeatureHandler(
            config_path=write_config(self.tmp_path, rollout, experiment_mode)
        )

    def test_full_rollout_is_the_active_arm(self) -> None:
        handler = self.handler(rollout=100)

        assert handler.has(OrganizationFeature(FEATURE, self.organization), self.user) is True
        assert handler.get_experiment_assignments(self.organization) == {
            "experiment-logs-cta": "active"
        }

    def test_zero_rollout_is_the_control_arm(self) -> None:
        handler = self.handler(rollout=0)

        assert handler.has(OrganizationFeature(FEATURE, self.organization), self.user) is False
        assert handler.get_experiment_assignments(self.organization) == {
            "experiment-logs-cta": "control"
        }

    def test_flag_without_experiment_mode_yields_no_assignment(self) -> None:
        handler = self.handler(rollout=100, experiment_mode=None)

        assert handler.has(OrganizationFeature(FEATURE, self.organization), self.user) is True
        assert handler.get_experiment_assignments(self.organization) == {}

    def test_unknown_flag_falls_through_to_sentry_features(self) -> None:
        handler = self.handler(rollout=100)
        unknown = OrganizationFeature("organizations:not-in-local-config", self.organization)

        assert handler.has(unknown, self.user) is None

    def test_config_edits_take_effect_without_a_restart(self) -> None:
        """
        The devserver's autoreloader only watches Python files, so the parsed
        config is cached on mtime rather than for the process lifetime.
        """
        import os

        handler = self.handler(rollout=0)
        assert handler.get_experiment_assignments(self.organization) == {
            "experiment-logs-cta": "control"
        }

        path = write_config(self.tmp_path, rollout=100)
        # Filesystem mtime resolution is coarse enough that a fast rewrite can
        # land on the same timestamp; bump it explicitly.
        stat = os.stat(path)
        os.utime(path, (stat.st_atime + 1, stat.st_mtime + 1))

        assert handler.get_experiment_assignments(self.organization) == {
            "experiment-logs-cta": "active"
        }

    def test_batch_has_scopes_results_by_organization(self) -> None:
        handler = self.handler(rollout=100)

        result = handler.batch_has([FEATURE], self.user, organization=self.organization)

        assert result == {f"organization:{self.organization.id}": {FEATURE: True}}

    def test_assignment_keys_drop_the_scope_prefix(self) -> None:
        """The frontend looks these up as organization.experiments['experiment-<id>']."""
        handler = self.handler(rollout=100)

        assert list(handler.get_experiment_assignments(self.organization)) == [
            "experiment-logs-cta"
        ]


class DevFlagpoleShippedConfigTest(TestCase):
    """The checked-in config must stay loadable."""

    def test_shipped_config_parses(self) -> None:
        # Ships empty: experiments are added per experiment, not kept around.
        assert DevFlagpoleFeatureHandler().features_by_name == {}

    def test_shipped_config_yields_no_assignments(self) -> None:
        handler = DevFlagpoleFeatureHandler()

        assert handler.get_experiment_assignments(self.organization) == {}
        assert handler.has(OrganizationFeature(FEATURE, self.organization), self.user) is None


class DevFlagpoleMissingConfigTest(TestCase):
    """
    FeatureManager.has() does not wrap entity-handler calls, so raising here
    would turn a missing config into failing page loads rather than a
    fall-through to SENTRY_FEATURES.
    """

    def test_missing_config_falls_through(self) -> None:
        handler = DevFlagpoleFeatureHandler(config_path="/nonexistent/flagpole.yaml")

        assert handler.features_by_name == {}
        assert handler.has(OrganizationFeature(FEATURE, self.organization), self.user) is None
        assert handler.get_experiment_assignments(self.organization) == {}

    def test_malformed_config_falls_through(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "flagpole.yaml"
            path.write_text("options: [this is not a mapping\n")
            handler = DevFlagpoleFeatureHandler(config_path=str(path))

            assert handler.features_by_name == {}
            assert handler.has(OrganizationFeature(FEATURE, self.organization), self.user) is None


class DevFlagpoleManagerIntegrationTest(TestCase):
    """
    The seam that matters: FeatureManager delegating to the entity handler is
    what populates organization.experiments on the API payload.
    """

    def setUp(self) -> None:
        super().setUp()
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        self.tmp_path = Path(self._tmp.name)

    def manager(self, rollout: int) -> FeatureManager:
        manager = FeatureManager()
        manager.add(FEATURE, OrganizationFeature)
        manager.add_entity_handler(
            DevFlagpoleFeatureHandler(config_path=write_config(self.tmp_path, rollout))
        )
        return manager

    def test_manager_surfaces_the_active_assignment(self) -> None:
        manager = self.manager(rollout=100)

        assert manager.get_experiment_assignments(self.organization) == {
            "experiment-logs-cta": "active"
        }
        assert manager.has(FEATURE, self.organization, actor=self.user) is True

    def test_manager_surfaces_the_control_assignment(self) -> None:
        manager = self.manager(rollout=0)

        assert manager.get_experiment_assignments(self.organization) == {
            "experiment-logs-cta": "control"
        }
        assert manager.has(FEATURE, self.organization, actor=self.user) is False

    def test_manager_returns_no_assignments_without_the_handler(self) -> None:
        manager = FeatureManager()
        manager.add(FEATURE, OrganizationFeature)

        assert manager.get_experiment_assignments(self.organization) == {}
