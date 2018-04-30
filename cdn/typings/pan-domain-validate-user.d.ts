// TODO MRB: move to https://github.com/guardian/pan-domain-validate-user repo itself
declare module 'pan-domain-validate-user' {
    export type PandaUser = {
        firstName: string,
        lastName: string,
        email: string,
        multifactor: boolean
    }

    export default function(cookie: string, publicKey: string): Promise<PandaUser>;   
}