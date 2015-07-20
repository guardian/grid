import Rx from 'rx';

export const combine$ = Rx.Observable.combineLatest;

function combine2$(a$, b$, resultSelector) {
    if (a$ instanceof Rx.Observable) {
        if (b$ instanceof Rx.Observable) {
            return combine$(a$, b$, resultSelector);
        } else {
            return a$.map(a => resultSelector(a, b$));
        }
    } else {
        if (b$ instanceof Rx.Observable) {
            return b$.map(b => resultSelector(a$, b));
        } else {
            return Rx.Observable.return(resultSelector(a$, b$));
        }
    }
}


export function add$(a$, b$) {
    return combine2$(a$, b$, (a, b) => a + b);
}
export function sub$(a$, b$) {
    return combine2$(a$, b$, (a, b) => a - b);
}
export function mult$(a$, b$) {
    return combine2$(a$, b$, (a, b) => a * b);
}
export function div$(a$, b$) {
    return combine2$(a$, b$, (a, b) => a / b);
}
export function mod$(a$, b$) {
    return combine2$(a$, b$, (a, b) => a % b);
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
export function max$(s$, n$) {
    return combine2$(s$, n$, (x, n) => Math.max(x, n));
}
export function min$(s$, n$) {
    return combine2$(s$, n$, (x, n) => Math.min(x, n));
}
