// Google Play Books EPUB profile.
//
// Google Play Books accepts standard EPUB 3 and is mostly Apple-compatible.
// The one requirement is that dc:identifier must be a valid URN — either a
// proper ISBN URN (urn:isbn:978-…) or a UUID URN (urn:uuid:…). Our base
// compile already generates a UUID if no ISBN is provided, so the only
// adjustment is normalising the identifier format in the metadata.

export const id = 'google';
export const label = 'Google Play Books';
export const format = 'epub';
export const filenameSuffix = 'google';

export function applyProfileCss() {
  return '';
}

export function applyProfileMetadata(metadata) {
  // Ensure identifier is a proper URN for Google's OPF validator
  const id = metadata.identifier || '';
  if (id && !id.startsWith('urn:')) {
    const normalised = id.match(/^\d{13}$/)
      ? `urn:isbn:${id}`
      : `urn:uuid:${id}`;
    return { ...metadata, identifier: normalised };
  }
  return metadata;
}
