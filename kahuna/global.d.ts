declare module '*.module.css' {
  const classes: { readonly [key: string]: string }
  export default classes
}

declare module '*.html' {
  const template: string;
  export default template;
}

declare module '*.svg' {
  const content: string;
  export default content;
}

