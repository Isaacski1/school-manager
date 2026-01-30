declare module "*.png" {
  const value: string;
  export default value;
}

declare module "*.jpg" {
  const value: string;
  export default value;
}

declare module "*.jpeg" {
  const value: string;
  export default value;
}

declare module "*.gif" {
  const value: string;
  export default value;
}

declare module "*.bmp" {
  const value: string;
  export default value;
}

declare module "*.tiff" {
  const value: string;
  export default value;
}

interface ImportMetaEnv {
  readonly BASE_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
