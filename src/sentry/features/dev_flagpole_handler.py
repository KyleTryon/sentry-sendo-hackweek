"""
A development-only Flagpole entity handler.

In production, ``FeatureManager.get_experiment_assignments()`` delegates to
getsentry's ``FlagpoleFeatureHandler``. That handler is not in this repo, so the
base implementation returns ``{}``, ``organization.experiments`` is always empty,
and every experiment resolves to the ``control`` assignment locally — even for an
organization the element renders for.

This handler closes that gap for local development by running the real Flagpole
evaluation engine (``Feature.match`` and ``ExperimentMode.get_assignment``)
against a checked-in ``flagpole.yaml``. It is not a second assignment system:
the evaluation path is the same one production uses, only the config source
differs.

It is off unless ``SENDO_LOCAL_FLAGPOLE=1`` is set, and it refuses to displace an
already-registered entity handler. See ``.agents/skills/sendo/references/local-setup.md``.
"""

from __future__ import annotations

import logging
import os
from collections.abc import Sequence
from functools import lru_cache
from pathlib import Path
from typing import TYPE_CHECKING, Any

import yaml

from flagpole import Feature as FlagpoleFeature
from flagpole.evaluation_context import ContextBuilder
from sentry.features.handler import FeatureHandler

if TYPE_CHECKING:
    from django.contrib.auth.models import AnonymousUser

    from sentry.features.base import Feature
    from sentry.features.manager import FeatureManager
    from sentry.models.organization import Organization
    from sentry.models.project import Project
    from sentry.organizations.services.organization.model import RpcOrganization
    from sentry.users.models.user import User
    from sentry.users.services.user import RpcUser

logger = logging.getLogger(__name__)

ENV_VAR = "SENDO_LOCAL_FLAGPOLE"

DEFAULT_CONFIG_PATH = Path(__file__).parent / "dev_flagpole.yaml"

# Flagpole config keys are the backing option name, which prefixes the feature.
OPTION_PREFIX = "feature."


def is_enabled() -> bool:
    return os.environ.get(ENV_VAR) == "1"


@lru_cache(maxsize=8)
def _load_features_cached(path: str, mtime: float) -> dict[str, FlagpoleFeature]:
    """
    Parse the local flagpole.yaml into features keyed by feature name.

    Uses the same ``options:`` layout as sentry-options-automator, so the same
    file can be inspected with ``python -m flagpole.flagpole_eval``.

    Keyed on mtime so editing the config takes effect on the next request: the
    devserver's autoreloader only watches Python files, and requiring a restart
    to change a rollout percentage would make the local loop tedious.
    """
    try:
        with open(path) as config_file:
            parsed = yaml.safe_load(config_file) or {}
    except (OSError, yaml.YAMLError):
        # A dev convenience must not break feature checks. FeatureManager.has()
        # does not wrap entity-handler calls, so raising here would turn a
        # missing or malformed config into failing page loads rather than a
        # fall-through to SENTRY_FEATURES.
        logger.warning("Could not read %s; falling back to SENTRY_FEATURES.", path)
        return {}

    options: dict[str, Any] = parsed.get("options") or {}

    features = {}
    for option_name, definition in options.items():
        if not option_name.startswith(OPTION_PREFIX):
            continue
        feature_name = option_name[len(OPTION_PREFIX) :]
        features[feature_name] = FlagpoleFeature.from_feature_dictionary(
            name=feature_name, config_dict=definition
        )
    return features


def _load_features(path: str) -> dict[str, FlagpoleFeature]:
    try:
        mtime = os.path.getmtime(path)
    except OSError:
        mtime = 0.0
    return _load_features_cached(path, mtime)


class DevFlagpoleFeatureHandler(FeatureHandler):
    """
    Evaluates flags from a local flagpole.yaml. Development only.
    """

    def __init__(self, config_path: str | None = None) -> None:
        self.config_path = config_path or str(DEFAULT_CONFIG_PATH)
        self._context_builder: ContextBuilder[Any] | None = None

    @property
    def context_builder(self) -> ContextBuilder[Any]:
        # Built lazily: sentry.features is imported before the Django app
        # registry is ready, and flagpole_context imports Django models at module
        # scope. By the time a flag is actually evaluated, apps are loaded.
        if self._context_builder is None:
            from sentry.features.flagpole_context import get_sentry_flagpole_context_builder

            self._context_builder = get_sentry_flagpole_context_builder()
        return self._context_builder

    @property
    def features_by_name(self) -> dict[str, FlagpoleFeature]:
        return _load_features(self.config_path)

    def _evaluate(
        self,
        feature_name: str,
        organization: Organization | RpcOrganization | None,
        actor: User | RpcUser | AnonymousUser | None = None,
        project: Project | None = None,
    ) -> bool | None:
        feature = self.features_by_name.get(feature_name)
        if feature is None:
            # Unknown to the local config — fall through to SENTRY_FEATURES.
            return None

        from sentry.features.flagpole_context import SentryContextData

        context = self.context_builder.build(
            SentryContextData(actor=actor, organization=organization, project=project)
        )
        return feature.match(context)

    def has(
        self,
        feature: Feature,
        actor: User | RpcUser | AnonymousUser | None,
        skip_entity: bool | None = False,
        skip_experiment_exposure: bool = False,
    ) -> bool | None:
        from sentry.features.base import OrganizationFeature, ProjectFeature

        organization = None
        project = None
        if isinstance(feature, OrganizationFeature):
            organization = feature.organization
        elif isinstance(feature, ProjectFeature):
            project = feature.project
            organization = feature.project.organization

        return self._evaluate(feature.name, organization, actor, project)

    def batch_has(
        self,
        feature_names: Sequence[str],
        actor: User | RpcUser | AnonymousUser | None,
        projects: Sequence[Project] | None = None,
        organization: Organization | RpcOrganization | None = None,
        batch: bool = True,
        skip_experiment_exposure: bool = False,
    ) -> dict[str, dict[str, bool | None]] | None:
        if projects:
            return {
                f"project:{project.id}": {
                    name: self._evaluate(name, project.organization, actor, project)
                    for name in feature_names
                }
                for project in projects
            }

        if organization:
            return {
                f"organization:{organization.id}": {
                    name: self._evaluate(name, organization, actor) for name in feature_names
                }
            }

        return {"unscoped": {name: self._evaluate(name, None, actor) for name in feature_names}}

    def get_experiment_assignments(
        self,
        organization: Organization,
        actor: User | RpcUser | AnonymousUser | None = None,
    ) -> dict[str, str]:
        """
        Assignments for every locally configured flag with ``experiment_mode`` set.

        Keys drop the ``organizations:`` scope prefix, matching what the
        organization serializer puts on ``organization.experiments`` and what the
        frontend looks up.
        """
        assignments = {}
        for feature_name, feature in self.features_by_name.items():
            if feature.experiment_mode is None:
                continue

            result = self._evaluate(feature_name, organization, actor)
            if result is None:
                continue

            _scope, _, unscoped_name = feature_name.partition(":")
            assignments[unscoped_name or feature_name] = feature.experiment_mode.get_assignment(
                result
            )
        return assignments


def register_if_enabled(manager: FeatureManager) -> bool:
    """
    Register the dev handler, but only in development and only if nothing else
    claimed the slot.

    ``add_entity_handler`` assigns a single ``_entity_handler``, so last
    registration wins. Refusing to overwrite keeps this from ever displacing
    getsentry's handler if both are somehow loaded.
    """
    if not is_enabled():
        return False

    if getattr(manager, "_entity_handler", None) is not None:
        logger.warning(
            "%s is set but an entity handler is already registered; not overriding it.",
            ENV_VAR,
        )
        return False

    manager.add_entity_handler(DevFlagpoleFeatureHandler())
    logger.info("Registered DevFlagpoleFeatureHandler from %s", DEFAULT_CONFIG_PATH)
    return True
