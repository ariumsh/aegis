import { Subcommand } from "@sapphire/plugin-subcommands";
import { resolveKey } from "@sapphire/plugin-i18next";
import { ComponentType } from "discord.js";
import { prisma } from "../../../../../database/db";
import { CacheManager, deleteMatching } from "../../../../../database/CacheManager";
import {
  applyLoadingState,
  getCancelledLayout,
  getResetLayout,
} from "../../../../../lib/layouts/modCommandLayouts";
import { getMessageLayout } from "../../../../../lib/layouts/defaultLayout";
import { container } from "@sapphire/framework";
import { WEBHOOK_NAME } from "../../../../../lib/constants/bot";
import {
  getDisplayNameKey,
  moduleCollectorReasons,
  moduleDefaults,
  moduleIds,
  moduleOptionName,
  moduleTimeoutsMs,
} from "../constants";

type ResetHandler = (guildId: string, client: any) => Promise<void>;

const RESET_MAP: Record<string, ResetHandler> = {
  vanity: async (guildId, client) => {
    const config = await prisma.guildConfig.findUnique({ where: { guildId } });
    if (!config) return;

    if (config.vanityChannelId && config.vanityChannelCreatedByBot) {
      const channel = await client.channels
        .fetch(config.vanityChannelId)
        .catch(() => null);
      if (channel?.isTextBased()) {
        const webhooks = await channel.fetchWebhooks().catch(() => null);
        const ownWebhook = webhooks?.find((wh: any) => wh.name === WEBHOOK_NAME);
        await ownWebhook?.delete("Module reset").catch(() => {});
      }
      await channel?.delete("Aegis - Vanity module reset").catch(() => {});
    }

    if (config.vanityRoleId && config.vanityRoleCreatedByBot) {
      const guild = client.guilds.cache.get(guildId);
      const role = await guild?.roles
        .fetch(config.vanityRoleId)
        .catch(() => null);
      await role?.delete("Aegis - Vanity module reset").catch(() => {});
    }

    const updated = await prisma.guildConfig.update({
      where: { guildId },
      data: {
        vanityString: null,
        vanityRoleId: null,
        vanityChannelId: null,
        vanityModule: false,
        vanityRoleCreatedByBot: false,
        vanityChannelCreatedByBot: false,
      },
    });
    await CacheManager.syncGuild(guildId, updated);
  },
  mod: async (guildId, client) => {
    const config = await prisma.guildConfig.findUnique({ where: { guildId } });
    if (!config) return;

    if (config.modLogChannelId && config.modChannelCreatedByBot) {
      const channel = await client.channels
        .fetch(config.modLogChannelId)
        .catch(() => null);
      await channel?.delete("Aegis - Mod module reset").catch(() => {});
    }

    if (config.mutedRoleId && config.modRoleCreatedByBot) {
      const guild = client.guilds.cache.get(guildId);
      const role = await guild?.roles
        .fetch(config.mutedRoleId)
        .catch(() => null);
      await role?.delete("Aegis - Mod module reset").catch(() => {});
    }

    const updated = await prisma.guildConfig.update({
      where: { guildId },
      data: {
        modLogChannelId: null,
        modModule: false,
        modThresholdsEnabled: false,
        muteThreshold: 3,
        banThreshold: 5,
        mutedRoleId: null,
        modChannelCreatedByBot: false,
        modRoleCreatedByBot: false,
        thresholdMode: moduleDefaults.thresholdMode,
      },
    });

    await prisma.modThreshold.deleteMany({ where: { guildId } });
    await CacheManager.syncGuild(guildId, updated);
  },
  tickets: async (guildId, client) => {
    const config = await prisma.guildConfig.findUnique({ where: { guildId } });
    if (!config) return;

    // Delete the panel message if it still exists
    if (config.ticketsPanelChannelId && config.ticketsPanelMessageId) {
      const guild = client.guilds.cache.get(guildId);
      if (guild) {
        const panelCh = guild.channels.cache.get(config.ticketsPanelChannelId);
        if (panelCh?.isTextBased()) {
          await (panelCh as any).messages?.delete(config.ticketsPanelMessageId).catch(() => {});
        }
      }
    }

    // Close all active tickets without spamming transcripts
    await prisma.ticket.deleteMany({ where: { guildId } });

    // Clear all tickets Redis runtime keys for this guild
    await deleteMatching(`tickets:*:${guildId}*`);

    const updated = await prisma.guildConfig.update({
      where: { guildId },
      data: {
        ticketsModule: false,
        ticketsPanelChannelId: null,
        ticketsCategoryId: null,
        ticketsTranscriptChannelId: null,
        ticketsLogChannelId: null,
        ticketsSupporterRoleIds: [],
        ticketsPanelMessageId: null
      }
    });
    await CacheManager.syncGuild(guildId, updated);
  },
  counter: async (guildId) => {
    const config = await prisma.guildConfig.findUnique({ where: { guildId } });
    if (!config) return;

    // Deletes the published message and stops tracking. The channel is left
    // alone: unlike the other modules the bot may not have created it, and a
    // stats channel usually has other things in it.
    await container.counterService.remove(guildId);

    const updated = await prisma.guildConfig.update({
      where: { guildId },
      data: {
        counterModule: false,
        counterChannelId: null,
        counterMessageId: null,
      },
    });
    await CacheManager.syncGuild(guildId, updated);
  },
};

async function getResetDeletions(
  interaction: Subcommand.ChatInputCommandInteraction,
  moduleName: string,
  guildId: string,
): Promise<string[]> {
  const config = await prisma.guildConfig.findUnique({ where: { guildId } });
  if (!config) return [];

  const deletions: string[] = [];

  if (moduleName === moduleIds.vanity) {
    if (config.vanityChannelId) {
      if (config.vanityChannelCreatedByBot) {
        deletions.push(
          await resolveKey(
            interaction,
            "modules:module.reset.deletions.deleteChannel",
            { id: config.vanityChannelId },
          ),
        );
      } else {
        deletions.push(
          await resolveKey(
            interaction,
            "modules:module.reset.deletions.unlinkChannel",
            { id: config.vanityChannelId },
          ),
        );
      }
    }
    if (config.vanityRoleId) {
      if (config.vanityRoleCreatedByBot) {
        deletions.push(
          await resolveKey(
            interaction,
            "modules:module.reset.deletions.deleteRole",
            { id: config.vanityRoleId },
          ),
        );
      } else {
        deletions.push(
          await resolveKey(
            interaction,
            "modules:module.reset.deletions.unlinkRole",
            { id: config.vanityRoleId },
          ),
        );
      }
    }
  }

  if (moduleName === moduleIds.mod) {
    if (config.modLogChannelId) {
      if (config.modChannelCreatedByBot) {
        deletions.push(
          await resolveKey(
            interaction,
            "modules:module.reset.deletions.deleteChannel",
            { id: config.modLogChannelId },
          ),
        );
      } else {
        deletions.push(
          await resolveKey(
            interaction,
            "modules:module.reset.deletions.unlinkChannel",
            { id: config.modLogChannelId },
          ),
        );
      }
    }
    if (config.mutedRoleId) {
      if (config.modRoleCreatedByBot) {
        deletions.push(
          await resolveKey(
            interaction,
            "modules:module.reset.deletions.deleteRole",
            { id: config.mutedRoleId },
          ),
        );
      } else {
        deletions.push(
          await resolveKey(
            interaction,
            "modules:module.reset.deletions.unlinkRole",
            { id: config.mutedRoleId },
          ),
        );
      }
    }
  }

  if (moduleName === moduleIds.tickets) {
    if (config.ticketsPanelChannelId) {
      deletions.push(
        await resolveKey(
          interaction,
          "modules:module.reset.deletions.unlinkChannel",
          { id: config.ticketsPanelChannelId },
        ),
      );
    }
    deletions.push(
      await resolveKey(
        interaction,
        "modules:module.reset.deletions.configOnly",
      ),
    );
  }

  if (moduleName === moduleIds.counter) {
    if (config.counterChannelId) {
      deletions.push(
        await resolveKey(
          interaction,
          "modules:module.reset.deletions.unlinkChannel",
          { id: config.counterChannelId },
        ),
      );
    }
    deletions.push(
      await resolveKey(interaction, "modules:module.reset.deletions.configOnly"),
    );
  }

  if (deletions.length === 0) {
    deletions.push(
      await resolveKey(
        interaction,
        "modules:module.reset.deletions.configOnly",
      ),
    );
  }

  return deletions;
}

export async function handleReset(
  interaction: Subcommand.ChatInputCommandInteraction,
) {
  const { guildId, options, user } = interaction;
  const moduleName = options.getString(moduleOptionName, true);
  const confirmId = `confirm_${interaction.id}`;
  const cancelId = `cancel_${interaction.id}`;
  const displayName = await resolveKey(
    interaction,
    getDisplayNameKey(moduleName),
  );

  const deletions = await getResetDeletions(interaction, moduleName, guildId!);
  const title = await resolveKey(interaction, "modules:module.reset.title", {
    name: displayName,
  });
  const description = await resolveKey(
    interaction,
    "modules:module.reset.description",
    { name: displayName },
  );
  const confirmText = await resolveKey(
    interaction,
    "modules:module.reset.confirm",
  );
  const cancelText = await resolveKey(
    interaction,
    "modules:module.reset.cancel",
  );

  await interaction.reply({
    ...getResetLayout(
      confirmId,
      cancelId,
      title,
      description,
      Array.isArray(deletions) ? deletions.join("\n") : deletions,
      confirmText,
      cancelText,
    ),
  });

  const response = await interaction.fetchReply();
  const collector = response.createMessageComponentCollector({
    componentType: ComponentType.Button,
    time: moduleTimeoutsMs.resetConfirm,
    filter: (i) => i.user.id === user.id,
  });

  collector.on("collect", async (i) => {
    if (i.customId === confirmId) {
      const baseLayout = getResetLayout(
        confirmId,
        cancelId,
        title,
        description,
        Array.isArray(deletions) ? deletions.join("\n") : deletions,
        confirmText,
        cancelText,
      );
      const loadingLayout = applyLoadingState(baseLayout);

      await i.update(loadingLayout as any);
      await RESET_MAP[moduleName]?.(guildId!, container.client);
      const success = await resolveKey(
        interaction,
        "modules:module.reset.success",
        { name: displayName },
      );
      return i
        .editReply({
          ...getMessageLayout(success),
        })
        .then(() => collector.stop(moduleCollectorReasons.success));
    }
    if (i.customId === cancelId) {
      const cancelled = await resolveKey(
        interaction,
        "modules:module.reset.cancelled",
      );
      return i
        .update({ ...getCancelledLayout(cancelled) })
        .then(() => collector.stop(moduleCollectorReasons.cancelled));
    }
  });

  collector.on("end", async (_, reason) => {
    if (
      reason !== moduleCollectorReasons.success &&
      reason !== moduleCollectorReasons.cancelled
    ) {
      const timedOut = await resolveKey(
        interaction,
        "modules:module.reset.timedOut",
      );
      await response.edit({ ...getMessageLayout(timedOut) }).catch(() => null);
    }
  });
}
