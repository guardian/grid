import Rx from 'rx';

export const combine$ = Rx.Observable.combineLatest;

export function add$(a$, b$) {
    return combine$(a$, b$, (a, b) => a + b);
}
export function sub$(a$, b$) {
    return combine$(a$, b$, (a, b) => a - b);
}
export function mult$(a$, b$) {
    return combine$(a$, b$, (a, b) => a * b);
}
export function div$(a$, b$) {
    return combine$(a$, b$, (a, b) => a / b);
}
export function mod$(a$, b$) {
    return combine$(a$, b$, (a, b) => a % b);
}
export function round$(s$) {
    return s$.map(Math.round);
}
export function floor$(s$) {
    return s$.map(Math.floor);
}
export function ceil$(s$) {
    return s$.map(Math.ceil);
}
export function max$(s$, n) {
    return s$.map(x => Math.max(x, n));
}
export function min$(s$, n) {
    return s$.map(x => Math.min(x, n));
}
