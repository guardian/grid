// TODO MRB: move to https://github.com/guardian/pan-domain-public-keys repo itself
declare module 'pan-domain-public-keys' {
    export function getPEM(stage: string): Promise<string>;
}