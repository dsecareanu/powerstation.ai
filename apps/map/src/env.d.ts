/// <reference types="vite/client" />
declare const __DEV_NOW__: string;
interface ImportMetaEnv {
  /** Public base URL of the data files, ending in "/". Default "/data/". */
  readonly VITE_DATA_BASE_URL?: string;
  /** Link to the data center calculator (Step 2). Default "/calculator/". */
  readonly VITE_CALCULATOR_URL?: string;
}
