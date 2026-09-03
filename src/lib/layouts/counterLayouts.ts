import { Emojis } from '../constants/emojis';
import { ContainerComponent, TextDisplayComponent } from './ui';
import type { CounterStats } from '../utils/counterStats';

/**
 * Components V2 dropped the inline fields classic embeds had, so the three
 * counters are one line of text and the spacing is done by hand. U+2800 is a
 * blank braille cell: unlike a normal space, Discord does not collapse a run of
 * them, which is what keeps the columns apart.
 */
const GAP = '⠀⠀';

/** One instance — building a formatter on every tick is wasteful. */
const formatter = new Intl.NumberFormat('en-US');

export function getCounterLine(stats: CounterStats): string {
    return [
        `${Emojis.counter_online_emoji} ${formatter.format(stats.online)}`,
        `${Emojis.counter_total_emoji} ${formatter.format(stats.total)}`,
        `${Emojis.counter_voice_emoji} ${formatter.format(stats.voice)}`
    ].join(GAP);
}

export function getCounterLayout(stats: CounterStats) {
    return {
        flags: 32768,
        components: [ContainerComponent([TextDisplayComponent(getCounterLine(stats))])]
    };
}
