import { ContainerComponent, TextDisplayComponent } from './ui';

export function getMessageLayout(message: string) {
    return {
        flags: 32768,
        components: [
            ContainerComponent([
                TextDisplayComponent(message || '...')
            ])
        ]
    };
}

