const hasSpace         = s     => /\s/g.test(s);
const labelMatch       = label => new RegExp(`(label:|#)("|')?${label}(("|')|\\b)`, 'g');
const createLabel      = label => hasSpace(label) ? `#"${label}"` : `#${label}`;

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

export function getLabel(name) {
    return createLabel(name);
}

export function getCollection(path) {
    return `~"${path}"`;
}

export function getCollectionsFromQuery(q) {
    const query = querySplit(q);
    const collections =  query ? query
        .filter(bit => bit.charAt(0) === '~')
        .map(path => path.replace(/('|"|~)/g, ''))
        : [];

    return collections;
}
