import {
  ChannelType,
  ComponentType,
  Guild,
  ModalSubmitInteraction,
  PermissionsBitField,
} from "discord.js";
import { prisma } from "../../../../../database/db";
import { CacheManager } from "../../../../../database/CacheManager";
import { getMessageLayout } from "../../../../../lib/layouts/defaultLayout";
import {
  applyLoadingState,
  getCancelledLayout,
  getModuleSetupConfirmLayout,
  getModuleSetupSummaryLayout,
} from "../../../../../lib/layouts/modCommandLayouts";
import { resolveKey } from "@sapphire/plugin-i18next";
import { Emojis } from "../../../../../lib/constants/emojis";
import { container } from "@sapphire/framework";
import {
  getDisplayNameKey,
  moduleCollectorReasons,
  moduleTimeoutsMs,
} from "../constants";

export async function resolveRole(
  target: ModalSubmitInteraction,
  input: string,
  guild: Guild,
  fallbackName: string,
): Promise<{ resolvedId: string | null; action: string; error?: string }> {
  if (!input) {
    const action = await resolveKey(
      target,
      "modules:module.setup.actions.createRole",
      { name: fallbackName },
    );
    return { resolvedId: null, action };
  }

  const isId = /^\d{17,20}$/.test(input);
  if (isId) {
    const existing = await guild.roles.fetch(input).catch(() => null);
    if (!existing) {
      const error = await resolveKey(
        target,
        "modules:module.setup.errors.roleIdNotFound",
      );
      return { resolvedId: null, action: "", error };
    }

    const action = await resolveKey(
      target,
      "modules:module.setup.actions.useRole",
      { name: existing.name },
    );
    return { resolvedId: existing.id, action };
  }

  const action = await resolveKey(
    target,
    "modules:module.setup.actions.createRole",
    { name: input },
  );
  return { resolvedId: null, action };
}

export async function resolveChannel(
  target: ModalSubmitInteraction,
  input: string,
  guild: Guild,
  fallbackName: string,
): Promise<{ resolvedId: string | null; action: string; error?: string }> {
  if (!input) {
    const action = await resolveKey(
      target,
      "modules:module.setup.actions.createChannel",
      { name: fallbackName },
    );
    return { resolvedId: null, action };
  }

  const isId = /^\d{17,20}$/.test(input);
  if (isId) {
    const existing = await guild.channels.fetch(input).catch(() => null);
    if (!existing) {
      const error = await resolveKey(
        target,
        "modules:module.setup.errors.channelIdNotFound",
      );
      return { resolvedId: null, action: "", error };
    }

    const action = await resolveKey(
      target,
      "modules:module.setup.actions.useChannel",
      { id: existing.id },
    );
    return { resolvedId: existing.id, action };
  }

  const action = await resolveKey(
    target,
    "modules:module.setup.actions.createChannel",
    { name: input },
  );
  return { resolvedId: null, action };
}

export async function createPrivateChannel(guild: Guild, name: string) {
  return guild.channels.create({
    name,
    type: ChannelType.GuildText,
    permissionOverwrites: [
      {
        id: guild.roles.everyone.id,
        deny: [PermissionsBitField.Flags.ViewChannel],
      },
    ],
  });
}

export async function runSetupFlow(
  modalSubmit: ModalSubmitInteraction,
  moduleName: string,
  previewActions: string[],
  run: (data: Record<string, any>, summaryActions: string[]) => Promise<void>,
) {
  const { guildId } = modalSubmit;
  const confirmId = `${moduleName}_confirm_${modalSubmit.id}`;
  const cancelId = `${moduleName}_cancel_${modalSubmit.id}`;

  const title = await resolveKey(modalSubmit, getDisplayNameKey(moduleName));
  const description = await resolveKey(
    modalSubmit,
    "modules:module.setup.confirm.description",
    { title },
  );
  const confirmLabel = await resolveKey(
    modalSubmit,
    "modules:module.setup.confirm.button",
  );
  const cancelLabel = await resolveKey(
    modalSubmit,
    "modules:module.setup.confirm.cancel",
  );
  const actionsText = previewActions
    .map((a) => `${Emojis.static_setting_emoji} ${a}`)
    .join("\n");
  const response = await modalSubmit.editReply({
    ...getModuleSetupConfirmLayout(
      confirmId,
      cancelId,
      title,
      description,
      actionsText,
      confirmLabel,
      cancelLabel,
    ),
  });

  const collector = response.createMessageComponentCollector({
    componentType: ComponentType.Button,
    time: moduleTimeoutsMs.setupConfirm,
    filter: (i) => i.user.id === modalSubmit.user.id,
  });

  collector.on("collect", async (i) => {
    try {
      if (i.customId === cancelId) {
        const cancelled = await resolveKey(
          modalSubmit,
          "modules:module.setup.errors.setupCancelled",
        );
        await i.update({ ...getCancelledLayout(cancelled) });
        collector.stop(moduleCollectorReasons.cancelled);
        return;
      }

      if (i.customId === confirmId) {
        const baseLayout = getModuleSetupConfirmLayout(
          confirmId,
          cancelId,
          title,
          description,
          actionsText,
          confirmLabel,
          cancelLabel,
        );
        const loadingLayout = applyLoadingState(baseLayout);
        await i.update(loadingLayout as any);

        const data: Record<string, any> = {};
        const summaryActions: string[] = [];

        await run(data, summaryActions);

        const updated = await prisma.guildConfig.upsert({
          where: { guildId: guildId! },
          create: { guildId: guildId!, ...data },
          update: data,
        });
        await CacheManager.syncGuild(guildId!, updated);

        const summaryText = summaryActions
          .map((a) => `${Emojis.static_setting_emoji} ${a}`)
          .join("\n");
        const completeHint = await resolveKey(
          modalSubmit,
          "modules:module.setup.summary.completeHint",
        );
        await response.edit({
          ...getModuleSetupSummaryLayout(title, summaryText, completeHint),
        });
        collector.stop(moduleCollectorReasons.success);
        return;
      }
    } catch (error) {
      container.logger.error(
        `[MODULE_SETUP] Collector interaction failed for ${moduleName}:`,
        error,
      );
      const failed = await resolveKey(
        modalSubmit,
        "modules:module.setup.errors.setupFailed",
      );
      await response.edit({ ...getMessageLayout(failed) }).catch(() => null);
      collector.stop("error");
    }
  });

  collector.on("end", async (_, reason) => {
    if (
      reason !== moduleCollectorReasons.success &&
      reason !== moduleCollectorReasons.cancelled
    ) {
      const timedOut = await resolveKey(
        modalSubmit,
        "modules:module.setup.errors.setupTimedOut",
      );
      await response.edit({ ...getMessageLayout(timedOut) }).catch(() => null);
    }
  });
}
