// ─────────────────────────────────────────────────────────────────────────────
//  ui.ts — Aegis Design System — Components V2
//
//  IMPORTANT: All message responses must use `flags: 32768` (IS_COMPONENTS_V2).
//  Classic embeds (`embeds: [...]`) and `content` fields are NOT used.
//  Every user-facing message is built with these factory functions.
//
//  Default accent color: 0xd77655 (handled by ContainerComponent).
//  Max 40 total components per message.
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────
//  LAYOUT COMPONENTS (Message only)
// ─────────────────────────────────────────────

/**
 * type 17 — Visually groups a set of components with an optional accent color bar.
 * Top-level component. Can contain: ActionRow, TextDisplay, Section, MediaGallery, Separator, File.
 */
export const ContainerComponent = (
    components: any[],
    accentColor: number | null = 0xd77655,
    spoiler: boolean = false
) => ({
    type: 17,
    ...(accentColor !== null && { accent_color: accentColor }),
    spoiler,
    components,
});

/**
 * type 9 — Associates text content with an accessory component (Button or Thumbnail).
 * Top-level component. Child components: TextDisplay only.
 * Accessory: Button (type 2) or Thumbnail (type 11).
 */
export const SectionComponent = (components: any[], accessory?: any) => ({
    type: 9,
    components,
    ...(accessory !== undefined && { accessory }),
});

/**
 * type 1 — Row of interactive components.
 * Can contain: up to 5 Buttons, OR a single Select (String/User/Role/Mentionable/Channel).
 * NOTE: Action Row with Text Inputs inside modals is deprecated — use LabelComponent instead.
 */
export const ActionRowComponent = (components: any[]) => ({
    type: 1,
    components,
});

/**
 * type 14 — Adds vertical padding and optional visual divider between components.
 * spacing: 1 = small, 2 = large.
 */
export const SeparatorComponent = (spacing: 1 | 2 = 1, divider: boolean = true) => ({
    type: 14,
    spacing,
    divider,
});

// ─────────────────────────────────────────────
//  CONTENT COMPONENTS (Message only)
// ─────────────────────────────────────────────

/**
 * type 10 — Markdown text. Supports mentions, emoji, links, spoilers.
 * Available in both messages and modals (bare, not inside ActionRow).
 * Falls back to zero-width space to avoid Discord rendering empty content errors.
 */
export const TextDisplayComponent = (content: string) => ({
    type: 10,
    content: content?.length > 0 ? content : '\u200B',
});

/**
 * type 11 — Small image, used as a Section accessory.
 * Only valid inside SectionComponent's `accessory` field.
 * Supports: images, GIF, WEBP. No video.
 */
export const ThumbnailComponent = (
    url: string,
    description?: string,
    spoiler: boolean = false
) => ({
    type: 11,
    media: { url },
    ...(description !== undefined && { description }),
    spoiler,
});

/**
 * type 12 — Displays 1–10 media items in a gallery layout.
 * Each item: { media: { url }, description?, spoiler? }
 */
export const MediaGalleryComponent = (
    items: Array<{ url: string; description?: string; spoiler?: boolean }>
) => ({
    type: 12,
    items: items.map(({ url, description, spoiler }) => ({
        media: { url },
        ...(description !== undefined && { description }),
        ...(spoiler !== undefined && { spoiler }),
    })),
});

/**
 * type 13 — Displays an uploaded file attachment.
 * `fileUrl` must use the `attachment://<filename>` syntax.
 */
export const FileComponent = (fileUrl: string, spoiler: boolean = false) => ({
    type: 13,
    file: { url: fileUrl },
    spoiler,
});

// ─────────────────────────────────────────────
//  INTERACTIVE COMPONENTS — MESSAGE
// ─────────────────────────────────────────────

/**
 * type 2 — Clickable button. Must be inside ActionRowComponent or SectionComponent accessory.
 * Styles: 1=Primary, 2=Secondary, 3=Success, 4=Danger, 5=Link (needs url), 6=Premium (needs sku_id).
 * Non-link/non-premium buttons must have custom_id. Link buttons must have url (no custom_id).
 */
export const ButtonComponent = (
    custom_id: string,
    label: string,
    style: 1 | 2 | 3 | 4 | 5 | 6,
    emoji?: { name?: string; id?: string; animated?: boolean },
    disabled: boolean = false
) => ({
    type: 2,
    custom_id,
    label,
    style,
    ...(emoji !== undefined && { emoji }),
    disabled,
});

/**
 * type 2 — Link button variant. Uses `url` instead of `custom_id`.
 * Does NOT send an interaction when clicked.
 */
export const LinkButtonComponent = (
    url: string,
    label: string,
    emoji?: { name?: string; id?: string; animated?: boolean },
    disabled: boolean = false
) => ({
    type: 2,
    style: 5,
    url,
    label,
    ...(emoji !== undefined && { emoji }),
    disabled,
});

/**
 * type 3 — Select menu with predefined text options. Must be inside ActionRowComponent.
 * Each option: { label, value, description?, emoji?, default? }
 */
export const StringSelectComponent = (
    custom_id: string,
    options: Array<{
        label: string;
        value: string;
        description?: string;
        emoji?: { name?: string; id?: string; animated?: boolean };
        default?: boolean;
    }>,
    placeholder?: string,
    minValues?: number,
    maxValues?: number,
    disabled: boolean = false
) => ({
    type: 3,
    custom_id,
    options,
    ...(placeholder !== undefined && { placeholder }),
    ...(minValues !== undefined && { min_values: minValues }),
    ...(maxValues !== undefined && { max_values: maxValues }),
    disabled,
});

/**
 * type 5 — Select menu auto-populated with server users. Must be inside ActionRowComponent.
 * `defaultValues`: pre-selected users — each entry must be `{ id: snowflake, type: "user" }`.
 * Count must be within [minValues, maxValues].
 */
export const UserSelectComponent = (
    custom_id: string,
    placeholder?: string,
    minValues?: number,
    maxValues?: number,
    defaultValues?: Array<{ id: string; type: 'user' }>,
    disabled: boolean = false
) => ({
    type: 5,
    custom_id,
    ...(placeholder !== undefined && { placeholder }),
    ...(minValues !== undefined && { min_values: minValues }),
    ...(maxValues !== undefined && { max_values: maxValues }),
    ...(defaultValues !== undefined && { default_values: defaultValues }),
    disabled,
});

/**
 * type 6 — Select menu auto-populated with server roles. Must be inside ActionRowComponent.
 * `defaultValues`: pre-selected roles — each entry must be `{ id: snowflake, type: "role" }`.
 * Count must be within [minValues, maxValues].
 */
export const RoleSelectComponent = (
    custom_id: string,
    placeholder?: string,
    minValues?: number,
    maxValues?: number,
    defaultValues?: Array<{ id: string; type: 'role' }>,
    disabled: boolean = false
) => ({
    type: 6,
    custom_id,
    ...(placeholder !== undefined && { placeholder }),
    ...(minValues !== undefined && { min_values: minValues }),
    ...(maxValues !== undefined && { max_values: maxValues }),
    ...(defaultValues !== undefined && { default_values: defaultValues }),
    disabled,
});

/**
 * type 7 — Select menu for users AND roles combined. Must be inside ActionRowComponent.
 * `defaultValues`: pre-selected entries — each must be `{ id: snowflake, type: "user" | "role" }`.
 * Count must be within [minValues, maxValues].
 */
export const MentionableSelectComponent = (
    custom_id: string,
    placeholder?: string,
    minValues?: number,
    maxValues?: number,
    defaultValues?: Array<{ id: string; type: 'user' | 'role' }>,
    disabled: boolean = false
) => ({
    type: 7,
    custom_id,
    ...(placeholder !== undefined && { placeholder }),
    ...(minValues !== undefined && { min_values: minValues }),
    ...(maxValues !== undefined && { max_values: maxValues }),
    ...(defaultValues !== undefined && { default_values: defaultValues }),
    disabled,
});

/**
 * type 8 — Select menu auto-populated with server channels. Must be inside ActionRowComponent.
 * `channelTypes`: filter by Discord channel type numbers (e.g. [0] = text, [2] = voice).
 * `defaultValues`: pre-selected channels — each must be `{ id: snowflake, type: "channel" }`.
 * Count must be within [minValues, maxValues].
 */
export const ChannelSelectComponent = (
    custom_id: string,
    placeholder?: string,
    channelTypes?: number[],
    minValues?: number,
    maxValues?: number,
    defaultValues?: Array<{ id: string; type: 'channel' }>,
    disabled: boolean = false
) => ({
    type: 8,
    custom_id,
    ...(placeholder !== undefined && { placeholder }),
    ...(channelTypes !== undefined && { channel_types: channelTypes }),
    ...(minValues !== undefined && { min_values: minValues }),
    ...(maxValues !== undefined && { max_values: maxValues }),
    ...(defaultValues !== undefined && { default_values: defaultValues }),
    disabled,
});

// ─────────────────────────────────────────────
//  MODAL-EXCLUSIVE COMPONENTS
//  All must be wrapped in LabelComponent (type 18).
//  Action Row with Text Inputs in modals is deprecated.
// ─────────────────────────────────────────────

/**
 * type 18 — Wraps a modal component with a label and optional description.
 * Required wrapper for all interactive components inside modals.
 * `description` renders above or below the component depending on platform.
 */
export const LabelComponent = (
    label: string,
    component: any,
    description?: string
) => ({
    type: 18,
    label,
    ...(description !== undefined && { description }),
    component,
});

/**
 * type 4 — Free-form text input. Must be inside LabelComponent in modals.
 * style: 1 = single-line (Short), 2 = multi-line (Paragraph).
 * `value`: pre-filled content (useful for edit/update modals).
 */
export const TextInputComponent = (
    custom_id: string,
    style: 1 | 2,
    options?: {
        minLength?: number;
        maxLength?: number;
        required?: boolean;
        value?: string;
        placeholder?: string;
    }
) => ({
    type: 4,
    custom_id,
    style,
    ...(options?.minLength !== undefined && { min_length: options.minLength }),
    ...(options?.maxLength !== undefined && { max_length: options.maxLength }),
    ...(options?.required !== undefined && { required: options.required }),
    ...(options?.value !== undefined && { value: options.value }),
    ...(options?.placeholder !== undefined && { placeholder: options.placeholder }),
});

/**
 * type 3 — String select inside a modal. Must be inside LabelComponent.
 * `required` is only valid in modals (ignored in messages).
 */
export const StringSelectModalComponent = (
    custom_id: string,
    options: Array<{
        label: string;
        value: string;
        description?: string;
        emoji?: { name?: string; id?: string };
        default?: boolean;
    }>,
    placeholder?: string,
    minValues?: number,
    maxValues?: number,
    required: boolean = true
) => ({
    type: 3,
    custom_id,
    options,
    ...(placeholder !== undefined && { placeholder }),
    ...(minValues !== undefined && { min_values: minValues }),
    ...(maxValues !== undefined && { max_values: maxValues }),
    required,
});

/**
 * type 5 — User select inside a modal. Must be inside LabelComponent.
 */
export const UserSelectModalComponent = (
    custom_id: string,
    placeholder?: string,
    maxValues?: number,
    required: boolean = true
) => ({
    type: 5,
    custom_id,
    ...(placeholder !== undefined && { placeholder }),
    ...(maxValues !== undefined && { max_values: maxValues }),
    required,
});

/**
 * type 6 — Role select inside a modal. Must be inside LabelComponent.
 */
export const RoleSelectModalComponent = (
    custom_id: string,
    placeholder?: string,
    maxValues?: number,
    required: boolean = true
) => ({
    type: 6,
    custom_id,
    ...(placeholder !== undefined && { placeholder }),
    ...(maxValues !== undefined && { max_values: maxValues }),
    required,
});

/**
 * type 7 — Mentionable select inside a modal. Must be inside LabelComponent.
 */
export const MentionableSelectModalComponent = (
    custom_id: string,
    placeholder?: string,
    required: boolean = true
) => ({
    type: 7,
    custom_id,
    ...(placeholder !== undefined && { placeholder }),
    required,
});

/**
 * type 8 — Channel select inside a modal. Must be inside LabelComponent.
 */
export const ChannelSelectModalComponent = (
    custom_id: string,
    placeholder?: string,
    channelTypes?: number[],
    required: boolean = true
) => ({
    type: 8,
    custom_id,
    ...(placeholder !== undefined && { placeholder }),
    ...(channelTypes !== undefined && { channel_types: channelTypes }),
    required,
});

/**
 * type 19 — File upload input. Must be inside LabelComponent in modals.
 */
export const FileUploadComponent = (
    custom_id: string,
    minValues: number = 1,
    maxValues: number = 1,
    required: boolean = true
) => ({
    type: 19,
    custom_id,
    min_values: minValues,
    max_values: maxValues,
    required,
});

/**
 * type 21 — Single-choice radio group. Must be inside LabelComponent in modals.
 * Each option: { value, label, description?, default? }
 * Min 2, max 10 options.
 */
export const RadioGroupComponent = (
    custom_id: string,
    options: Array<{
        value: string;
        label: string;
        description?: string;
        default?: boolean;
    }>,
    required: boolean = true
) => ({
    type: 21,
    custom_id,
    options,
    required,
});

/**
 * type 22 — Multi-choice checkbox group. Must be inside LabelComponent in modals.
 * Each option: { value, label, description?, default? }
 * Min 1, max 10 options.
 */
export const CheckboxGroupComponent = (
    custom_id: string,
    options: Array<{
        value: string;
        label: string;
        description?: string;
        default?: boolean;
    }>,
    minValues?: number,
    maxValues?: number,
    required: boolean = true
) => ({
    type: 22,
    custom_id,
    options,
    ...(minValues !== undefined && { min_values: minValues }),
    ...(maxValues !== undefined && { max_values: maxValues }),
    required,
});

/**
 * type 23 — Single yes/no checkbox. Must be inside LabelComponent in modals.
 * Cannot be set as required directly — use CheckboxGroupComponent with 1 option for that.
 */
export const CheckboxComponent = (
    custom_id: string,
    defaultChecked: boolean = false
) => ({
    type: 23,
    custom_id,
    default: defaultChecked,
});

// ─────────────────────────────────────────────
//  DEPRECATED — DO NOT USE
//  Kept only for reference during migration.
//  These are the old modal component names from ui.ts v1.
// ─────────────────────────────────────────────

/** @deprecated Use TextInputComponent instead */
export const TextInputComponentModal = TextInputComponent;

/** @deprecated Use StringSelectModalComponent instead */
export const StringSelectComponentModal = StringSelectModalComponent;

/** @deprecated Use UserSelectModalComponent instead */
export const UserSelectComponentModal = UserSelectModalComponent;

/** @deprecated Use RoleSelectModalComponent instead */
export const RoleSelectComponentModal = RoleSelectModalComponent;

/** @deprecated Use MentionableSelectModalComponent instead */
export const MentionableSelectComponentModal = MentionableSelectModalComponent;

/** @deprecated Use ChannelSelectModalComponent instead */
export const ChannelSelectComponentModal = ChannelSelectModalComponent;

/** @deprecated Use LabelComponent instead */
export const LabelComponentModal = LabelComponent;

/** @deprecated Use FileUploadComponent instead */
export const FileUploadComponentModal = FileUploadComponent;

/** @deprecated Use RadioGroupComponent instead */
export const RadioGroupComponentModal = RadioGroupComponent;

/** @deprecated Use CheckboxGroupComponent instead */
export const CheckboxGroupComponentModal = CheckboxGroupComponent;

/** @deprecated Use CheckboxComponent instead */
export const CheckboxComponentModal = CheckboxComponent;

/** @deprecated Use TextDisplayComponent instead */
export const TextDisplayComponentModal = TextDisplayComponent;