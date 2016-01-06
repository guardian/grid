const hasSpace         = s     => /\s/g.test(s);
const labelMatch       = label => new RegExp(`(label:|#)("|')?${label}(("|')|\\b)`, 'g');
const createLabel      = label => hasSpace(label) ? `#"${label}"` : `#${label}`;
const createCollection = path  => hasSpace(path) ? `~"${path}"` : `~${path}`;

function hasLabel(q, label) {
    return labelMatch(label).test(q);
}

function querySplit(q) {
    return q.match(/((~|#)?'.*?'|(~|#)?".*?"|\S+)/g);
}

export function addLabel(q, label) {
    return hasLabel(q, label) ? q : `${(q || '').trim()} ${createLabel(label)}`;
}

export function removeLabel(q, label) {
    return q.replace(labelMatch(label), '');
}

export function removeLabels(q, labels) {
    return labels.reduce((q, curr) => removeLabel(q, curr.name), q);
}

export function getCollection(path) {
    return createCollection(path);
}

export function getCollectionsFromQuery(q) {
    const collections =  querySplit(q) ? querySplit(q)
        .filter(bit => bit.charAt(0) === '~')
        .map(path => path.replace(/('|"|~)/g, '').split('/'))
        : '';

    return collections;
}
