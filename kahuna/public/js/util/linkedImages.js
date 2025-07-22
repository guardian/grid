/* ******************************************
   Code to indicate if messaging relating to
   linked images should be displayed
   ****************************************** */

const DEFAULT_LINKED_MESSAGE = "This image is linked to one or more equivalent images. To see usages for these linked images please use the links on the Metadata tab.";
const BBC_REPLACES_MESSAGE = "This image replaces a previous version. Super users can view the previous version’s usage by clicking the image ID under ‘Replaces’ in the metadata.";
const BBC_REPLACED_MESSAGE = "This image has been replaced by a newer version. Super users can view the latest version by clicking the image ID under ‘Replaced by’ in the metadata.";

const default_link_fields = [];
const bbc_link_fields = [
  ['data', 'metadata', 'domainMetadata', 'archives', 'supersedes'],
  ['data', 'metadata', 'domainMetadata', 'archives', 'superseded']
];

const checkValueAtPath = (obj, path) => {
    for (let i = 0; i < path.length; i++) {
        if (obj && obj.hasOwnProperty(path[i])) {
            obj = obj[path[i]];
        } else {
            return false;
        }
    }
    return obj !== undefined && obj !== null;
};

const checkFields = (image, fields) => {
  let hasField = false;
  for (let i = 0; i < fields.length; i++) {
    if (checkValueAtPath(image, fields[i])) { hasField = true; }
  }
  return hasField;
};

const message = (image, org_name) => {
  const messages = [];
  switch (org_name.toLowerCase()) {
    case 'bbc':
      if (checkValueAtPath(image, bbc_link_fields[0])) {
        messages.push(BBC_REPLACES_MESSAGE);
      }
      if (checkValueAtPath(image, bbc_link_fields[1])) {
        messages.push(BBC_REPLACED_MESSAGE);
      }
    default:
      messages.push(DEFAULT_LINKED_MESSAGE);
  }
  return messages;
};

export const displayLinkedImagesMessage = (image, org_name) => {
  switch (org_name.toLowerCase()) {
    case 'bbc':
      return checkFields(image, bbc_link_fields);
    default:
      return checkFields(image, default_link_fields);
  }
};

export const linkedImagesMessage = (image, org_name) => {
  return message(image, org_name);
};

