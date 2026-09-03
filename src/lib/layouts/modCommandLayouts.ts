// modCommandLayouts.ts — All Moderation & Module command-specific UI layouts

import type { GuildConfig } from "@prisma/client";
import type { Guild } from "discord.js";
import { Emojis } from "../constants/emojis";
import {
  ContainerComponent,
  TextDisplayComponent,
  SeparatorComponent,
  ActionRowComponent,
  ButtonComponent,
  SectionComponent,
  StringSelectComponent,
} from "./ui";

// ─────────────────────────────────────────────────────────────
// Shared Layout Helpers
// ─────────────────────────────────────────────────────────────

export function applyLoadingState(layout: {
  flags: number;
  components: any[];
}) {
  const clone = JSON.parse(JSON.stringify(layout));
  for (const container of clone.components) {
    if (!container.components) continue;
    for (const child of container.components) {
      if (child.type === 1 && child.components) {
        for (const btn of child.components) {
          if (btn.type === 2) {
            btn.disabled = true;
            if (btn.custom_id && btn.custom_id.includes("confirm")) {
              btn.label = "Cargando...";
              btn.style = 1;
            }
          }
        }
      }
    }
  }
  return clone;
}

// ─────────────────────────────────────────────────────────────
// Global Command Layouts
// ─────────────────────────────────────────────────────────────

export function getCancelledLayout(message: string) {
  return {
    flags: 32768,
    components: [ContainerComponent([TextDisplayComponent(message)])],
  };
}

export function getTimeoutLayout(message: string) {
  return {
    flags: 32768,
    components: [ContainerComponent([TextDisplayComponent(`⏱️ ${message}`)])],
  };
}

export function getStatusUpdateLayout(
  displayName: string,
  state: string,
  isEnabled: boolean,
) {
  const emoji = isEnabled
    ? Emojis.enabled_setting_emoji
    : Emojis.disabled_setting_emoji;
  return {
    flags: 32768,
    components: [
      ContainerComponent([TextDisplayComponent(`${emoji} ${state}`)]),
    ],
  };
}

// ─────────────────────────────────────────────────────────────
// Module Reset
// ─────────────────────────────────────────────────────────────

export function getResetLayout(
  confirmId: string,
  cancelId: string,
  title: string,
  description: string,
  deletionsText: string,
  yesLabel: string,
  noLabel: string,
) {
  return {
    flags: 32768,
    components: [
      ContainerComponent([
        TextDisplayComponent(
          `${Emojis.reset_module_emoji} **${title}**\n\n${description}\n\n${deletionsText}\n\n-# This action cannot be undone.`,
        ),
        SeparatorComponent(),
        ActionRowComponent([
          ButtonComponent(confirmId, yesLabel, 4),
          ButtonComponent(cancelId, noLabel, 2),
        ]),
      ]),
    ],
  };
}

// ─────────────────────────────────────────────────────────────
// Module Setup
// ─────────────────────────────────────────────────────────────

export function getModuleSetupConfirmLayout(
  confirmId: string,
  cancelId: string,
  title: string,
  description: string,
  actionsText: string,
  confirmLabel: string,
  cancelLabel: string,
) {
  return {
    flags: 32768,
    components: [
      ContainerComponent([
        TextDisplayComponent(
          `## ${title}\n\n${description}\n\n${actionsText}\n\nDo you want to continue?`,
        ),
        SeparatorComponent(),
        ActionRowComponent([
          ButtonComponent(confirmId, confirmLabel, 1),
          ButtonComponent(cancelId, cancelLabel, 4),
        ]),
      ]),
    ],
  };
}

export function getModuleSetupSummaryLayout(
  title: string,
  actionsText: string,
  footer: string,
) {
  return {
    flags: 32768,
    components: [
      ContainerComponent([
        TextDisplayComponent(`## ${title}\n\n${actionsText}\n\n-# ${footer}`),
      ]),
    ],
  };
}

// ─────────────────────────────────────────────────────────────
// Module Settings
// ─────────────────────────────────────────────────────────────

export function getModuleLayout(
  moduleName: string,
  config: GuildConfig,
  guild: Guild,
  labels: any,
) {
  const moduleConfigKeyMap: Record<string, string> = { tickets: 'ticketsModule', counter: 'counterModule' };
  const moduleConfigKey = moduleConfigKeyMap[moduleName] ?? `${moduleName}Module`;
  const isEnabled = (config as any)[moduleConfigKey] as boolean;
  const bullet = (value: unknown) =>
    value ? Emojis.enabled_setting_emoji : Emojis.disabled_setting_emoji;

  let details = "";

  if (moduleName === "vanity") {
    const role = guild.roles.cache.get(config.vanityRoleId ?? "");
    details = [
      `${bullet(config.vanityString)} **${labels.keyword}**: \`${
        config.vanityString || labels.notSet
      }\``,
      `${bullet(config.vanityRoleId)} **${labels.role}**: ${
        config.vanityRoleId
          ? `<@&${config.vanityRoleId}>`
          : `\`${labels.notSet}\``
      }`,
      `${bullet(config.vanityChannelId)} **${labels.channel}**: ${
        config.vanityChannelId
          ? `<#${config.vanityChannelId}>`
          : `\`${labels.notSet}\``
      }`,
      `${Emojis.static_setting_emoji} **${labels.usersWithVanity}**: \`${
        role ? role.members.size : 0
      }\``,
    ].join("\n");
  }

  if (moduleName === "mod") {
    const thresholdModeLabel =
      config.thresholdMode === "all_actions"
        ? labels.modeAllActions
        : labels.modeModular;
    const thresholdStatus = config.modThresholdsEnabled
      ? `${labels.enabled} (${thresholdModeLabel})`
      : labels.disabled;

    details = [
      `${bullet(config.modLogChannelId)} **${labels.logChannel}**: ${
        config.modLogChannelId
          ? `<#${config.modLogChannelId}>`
          : `\`${labels.notSet}\``
      }`,
      `${bullet(config.mutedRoleId)} **${labels.mutedRole}**: ${
        config.mutedRoleId
          ? `<@&${config.mutedRoleId}>`
          : `\`${labels.notSet}\``
      }`,
      `${bullet(config.modThresholdsEnabled)} **${
        labels.thresholds
      }**: \`${thresholdStatus}\``,
    ].join("\n");
  }

  if (moduleName === "counter") {
    details = [
      `${bullet((config as any).counterChannelId)} **${labels.channel}**: ${
        (config as any).counterChannelId
          ? `<#${(config as any).counterChannelId}>`
          : `\`${labels.notSet}\``
      }`,
      `${bullet((config as any).counterMessageId)} **${labels.message}**: \`${
        (config as any).counterMessageId || labels.notSet
      }\``,
    ].join("\n");
  }

  if (moduleName === "tickets") {
    details = [
      `${bullet((config as any).ticketsPanelChannelId)} **${labels.panelChannel}**: ${
        (config as any).ticketsPanelChannelId
          ? `<#${(config as any).ticketsPanelChannelId}>`
          : `\`${labels.notSet}\``
      }`,
      `${bullet((config as any).ticketsCategoryId)} **${labels.category}**: ${
        (config as any).ticketsCategoryId
          ? `<#${(config as any).ticketsCategoryId}>`
          : `\`${labels.notSet}\``
      }`,
      `${bullet((config as any).ticketsTranscriptChannelId)} **${labels.transcriptChannel}**: ${
        (config as any).ticketsTranscriptChannelId
          ? `<#${(config as any).ticketsTranscriptChannelId}>`
          : `\`${labels.notSet}\``
      }`,
      `${bullet((config as any).ticketsLogChannelId)} **${labels.logChannel}**: ${
        (config as any).ticketsLogChannelId
          ? `<#${(config as any).ticketsLogChannelId}>`
          : `\`${labels.notSet}\``
      }`,
      `${bullet((config as any).ticketsSupporterRoleIds?.length)} **${labels.supporterRoles}**: \`${
        (config as any).ticketsSupporterRoleIds?.length ?? 0
      }\``,
    ].join("\n");
  }

  return {
    flags: 32768,
    components: [
      ContainerComponent([
        SectionComponent(
          [TextDisplayComponent(`## ${labels.title}\n\n${details}`)],
          {
            type: 2,
            style: 2,
            label: isEnabled ? labels.enabled : labels.disabled,
            disabled: true,
            custom_id: `status_${moduleName}`,
            emoji: {
              id: isEnabled
                ? Emojis.enabled_module_emoji.match(/\d+/)?.[0]
                : Emojis.disabled_module_emoji.match(/\d+/)?.[0],
            },
          },
        ),
      ]),
    ],
  };
}

export function getStaffConfirmationLayout(data: {
  content: string;
  caseId: number;
}) {
  const hasCase = Number.isInteger(data.caseId) && data.caseId > 0;

  return {
    flags: 32768,
    components: [
      ContainerComponent([
        SectionComponent([TextDisplayComponent(data.content)], {
          type: 2,
          style: 2,
          label: hasCase ? `Case #${data.caseId}` : "Case unavailable",
          custom_id: hasCase
            ? `mod_case_${data.caseId}`
            : "mod_case_unavailable",
          disabled: !hasCase,
        }),
      ]),
    ],
  };
}

/**
 * Unified layout for Mod Logs and DMs.
 * Automatically handles field visibility and i18n mapping.
 */
export function getSanctionLayout(data: {
  type:
    | "ban"
    | "tempban"
    | "kick"
    | "mute"
    | "timeout"
    | "softban"
    | "warn"
    | "unban"
    | "unmute"
    | "untimeout";
  targetId: string;
  moderatorId: string;
  reason: string;
  duration?: string | null;
  labels: any; // { typeLabel: string, targetLabel: string, modLabel: string, reasonLabel: string, durationLabel: string, permanent: string }
  caseId?: number;
  createdAt?: Date;
}) {
  const {
    type,
    targetId,
    moderatorId,
    reason,
    duration,
    labels,
    caseId,
    createdAt,
  } = data;

  // Configuration map for colors and emojis
  const config = {
    ban: { color: 0xe93548, emoji: Emojis.ban_emoji },
    tempban: { color: 0xe93548, emoji: Emojis.tempban_emoji },
    softban: { color: 0xffb319, emoji: Emojis.softban_emoji },
    kick: { color: 0xff4132, emoji: Emojis.kick_emoji },
    mute: { color: 0x747b8c, emoji: Emojis.mute_emoji },
    timeout: { color: 0xff8b00, emoji: Emojis.timeout_emoji },
    warn: { color: 0xf6df3e, emoji: Emojis.warn_emoji },
    unban: { color: 0x00bf75, emoji: Emojis.unban_emoji },
    unmute: { color: 0x00bf75, emoji: Emojis.unmute_emoji },
    untimeout: { color: 0x00bf75, emoji: Emojis.unmute_emoji },
  };

  const style = config[type] || config.warn; // Fallback to warn style
  const timestamp = createdAt
    ? Math.floor(createdAt.getTime() / 1000)
    : Math.floor(Date.now() / 1000);

  // Build the content string
  const parts = [
    `## ${style.emoji} ${labels.typeLabel}`,
    `**${labels.targetLabel}:** <@${targetId}> (${targetId})`,
  ];

  if (["tempban", "mute", "timeout"].includes(type)) {
    parts.push(`**${labels.durationLabel}:** ${duration ?? labels.permanent}`);
  }

  parts.push(`**${labels.reasonLabel}:** ${reason}`);
  parts.push(""); // Empty line for spacing
  parts.push(`-# **${labels.modLabel}:** <@${moderatorId}> (${moderatorId})`);

  if (caseId) {
    parts.push(`-# Case #${caseId}・<t:${timestamp}:f>`);
  } else {
    parts.push(`-# <t:${timestamp}:f>`);
  }

  return {
    flags: 32768,
    components: [
      ContainerComponent([TextDisplayComponent(parts.join("\n"))], style.color),
    ],
  };
}

// ─────────────────────────────────────────────────────────────
// Silent Ban
// ─────────────────────────────────────────────────────────────

export function getSilentBanListLayout(
  title: string,
  countLabel: string,
  listText: string,
) {
  return {
    flags: 32768,
    components: [
      ContainerComponent([
        SectionComponent(
          [
            TextDisplayComponent(
              `${Emojis.static_setting_emoji} **${title}**⠀⠀⠀⠀⠀`,
            ),
          ],
          {
            type: 2,
            style: 2,
            disabled: true,
            custom_id: "silentban_list",
            label: countLabel,
          },
        ),
        SeparatorComponent(),
        TextDisplayComponent(listText),
      ]),
    ],
  };
}

export function getSilentBanAddLayout(
  content: string,
  durationLabel: string,
  caseNumber?: number,
  reason?: string | null,
) {
  const caseText = caseNumber ? `Case \`#${caseNumber}\` · ` : "";
  return {
    flags: 32768,
    components: [
      ContainerComponent([
        SectionComponent(
          [
            TextDisplayComponent(
              `${Emojis.enabled_setting_emoji} ${caseText}${content}`,
            ),
          ],
          {
            type: 2,
            style: 2,
            disabled: true,
            custom_id: "duration",
            label: durationLabel,
            emoji: { id: Emojis.date_emoji.match(/\d+/)?.[0]! },
          },
        ),
        ...(reason
          ? [
              SeparatorComponent(),
              TextDisplayComponent(
                `${Emojis.static_setting_emoji} **Reason**: ${reason}`,
              ),
            ]
          : []),
      ]),
    ],
  };
}

export function getSilentBanLayout(
  action: "add" | "remove" | "list",
  data: any,
) {
  if (action === "list")
    return getSilentBanListLayout(
      "Silent Ban List",
      `${data.count} users`,
      data.listText,
    );
  if (action === "remove")
    return {
      flags: 32768,
      components: [
        ContainerComponent([
          TextDisplayComponent(
            `${Emojis.disabled_setting_emoji} **${data.userTag}** has been removed from the silent ban list.`,
          ),
        ]),
      ],
    };
  return getSilentBanAddLayout(
    `**${data.userTag}** has been silent banned.`,
    data.duration,
    data.caseNumber,
    data.reason,
  );
}

// ─────────────────────────────────────────────────────────────
// Moderation — Thresholds
// ─────────────────────────────────────────────────────────────

export function getThresholdListLayout(data: {
  title: string;
  expirationText: string;
  listText: string;
  currentBranch: string;
  interactionId: string;
}) {
  const branchNames: Record<string, string> = {
    all: "All Actions",
    warn: "Warnings",
    mute: "Mutes",
    timeout: "Timeouts",
    kick: "Kicks",
    ban: "Bans",
  };
  const currentBranchName = branchNames[data.currentBranch] ?? "General";

  return {
    flags: 32768,
    components: [
      ContainerComponent([
        SectionComponent([TextDisplayComponent(`## ${data.title}⠀⠀⠀⠀⠀`)], {
          type: 2,
          style: 2,
          disabled: true,
          custom_id: "threshold_branch_display",
          label: currentBranchName,
          emoji: { id: Emojis.configuration_emoji.match(/\d+/)?.[0]! },
        }),
        TextDisplayComponent(data.expirationText),
        SeparatorComponent(),
        TextDisplayComponent(data.listText),
        SeparatorComponent(),
        ActionRowComponent([
          StringSelectComponent(
            `threshold_view_${data.interactionId}`,
            Object.entries(branchNames).map(([value, label]) => ({
              label,
              value,
              description: `View rules for ${label}`,
              default: value === data.currentBranch,
            })),
            "Switch branch...",
          ),
        ]),
      ]),
    ],
  };
}

// ─────────────────────────────────────────────────────────────
// Mod DM
// ─────────────────────────────────────────────────────────────

export function getModDMLayout(data: {
  title: string;
  description: string;
  reason: string | null;
  duration?: string | null;
  footer: string;
}) {
  return {
    components: [
      ContainerComponent(
        [
          SectionComponent(
            [TextDisplayComponent(`## ${data.title}\n\n${data.description}`)],
            {
              type: 2,
              style: 2,
              disabled: true,
              custom_id: "mod_dm_info",
              label: "Sanction Received",
              emoji: { id: Emojis.disabled_module_emoji.match(/\d+/)?.[0]! },
            },
          ),
          SeparatorComponent(),
          TextDisplayComponent(
            `${Emojis.static_setting_emoji} **Reason**: ${
              data.reason ?? "No reason provided"
            }`,
          ),
          ...(data.duration
            ? [
                TextDisplayComponent(
                  `${Emojis.date_emoji} **Duration**: ${data.duration}`,
                ),
              ]
            : []),
          SeparatorComponent(),
          TextDisplayComponent(`-# ${data.footer}`),
        ],
        0xf44336,
      ), // Keep red for DMs
    ],
  };
}

export function getRemoveCaseConfirmLayout(data: {
  caseNumber: number;
  userId: string;
  action: string;
  reason: string;
  confirmMsg: string;
}) {
  const content = [
    `### ${data.confirmMsg}`,
    `${Emojis.bullet_emoji} **User**: <@${data.userId}>`,
    `${Emojis.bullet_emoji} **Action**: \`${data.action}\``,
    `${Emojis.bullet_emoji} **Reason**: ${data.reason}`,
    "",
    "-# Respond with `Y` to confirm or `N` to cancel.",
  ].join("\n");

  return {
    flags: 32768,
    components: [ContainerComponent([TextDisplayComponent(content)], 0xf44336)],
  };
}

// ─────────────────────────────────────────────────────────────
// Moderation — Case Details
// ─────────────────────────────────────────────────────────────

export function getCaseDetailLayout(data: {
  caseNumber: number;
  userId: string;
  moderatorId: string;
  action: string;
  reason: string;
  duration?: string | null;
  createdAt: Date;
  labels: {
    title: string;
    user: string;
    moderator: string;
    action: string;
    reason: string;
    duration: string;
    date: string;
  };
}) {
  const lines = [
    `${Emojis.bullet_emoji} **${data.labels.user}**: <@${data.userId}> (\`${data.userId}\`)`,
    `${Emojis.bullet_emoji} **${data.labels.moderator}**: <@${data.moderatorId}>`,
    `${Emojis.bullet_emoji} **${
      data.labels.action
    }**: \`${data.action.toUpperCase()}\``,
    `${Emojis.bullet_emoji} **${data.labels.reason}**: ${data.reason}`,
  ];
  if (data.duration)
    lines.push(
      `${Emojis.bullet_emoji} **${data.labels.duration}**: ${data.duration}`,
    );
  lines.push(
    `${Emojis.bullet_emoji} **${data.labels.date}**: <t:${Math.floor(
      data.createdAt.getTime() / 1000,
    )}:F>`,
  );

  return {
    flags: 32768,
    components: [
      ContainerComponent([
        SectionComponent([TextDisplayComponent(`## ${data.labels.title}`)], {
          type: 2,
          style: 2,
          disabled: true,
          custom_id: "case_id",
          label: `#${data.caseNumber}`,
          emoji: { id: Emojis.static_setting_emoji.match(/\d+/)?.[0]! },
        }),
        SeparatorComponent(),
        TextDisplayComponent(lines.join("\n")),
      ]),
    ],
  };
}
