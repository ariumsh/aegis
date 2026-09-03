import { prefixMaxLength } from '../constants';

export function isPrefixValid(value: string) {
    return !(value.includes(' ') || value.length === 0 || value.length > prefixMaxLength);
}
