const marker = '// gloss';
const fileMarker = "// gloss:file";
const rendered = `${marker} // why: still not a comment`;
const pattern = /https:\/\/example\.com\/\/path/;

// gloss
export function getUser() {
  return `${marker}${fileMarker}${rendered}${pattern}`;
}

export function getUserById() {
  return 'by-id';
}
