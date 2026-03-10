import * as firebaseApp from "firebase/app";
import {
  ReCaptchaV3Provider,
  initializeAppCheck,
} from "firebase/app-check";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getFunctions } from "firebase/functions";

const fallbackFirebaseConfig = {
  apiKey: "AIzaSyCHlCLhumJn50nw2JBgJTGeIH_6GKzjFbA",
  authDomain: "noble-care-management-system.firebaseapp.com",
  projectId: "noble-care-management-system",
  storageBucket: "noble-care-management-system.firebasestorage.app",
  messagingSenderId: "573085015524",
  appId: "1:573085015524:web:29ae8a509813ec1199fbf1",
};

const envFirebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const hasCompleteEnvFirebaseConfig = Object.values(envFirebaseConfig).every(
  (value) => typeof value === "string" && value.trim().length > 0,
);

export const firebaseConfig = hasCompleteEnvFirebaseConfig
  ? {
      apiKey: envFirebaseConfig.apiKey!,
      authDomain: envFirebaseConfig.authDomain!,
      projectId: envFirebaseConfig.projectId!,
      storageBucket: envFirebaseConfig.storageBucket!,
      messagingSenderId: envFirebaseConfig.messagingSenderId!,
      appId: envFirebaseConfig.appId!,
    }
  : fallbackFirebaseConfig;

const firebaseFunctionsRegion =
  import.meta.env.VITE_FIREBASE_FUNCTIONS_REGION?.trim() || undefined;

// Initialize Firebase
const app = firebaseApp.initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const firestore = getFirestore(app);
export const functions = firebaseFunctionsRegion
  ? getFunctions(app, firebaseFunctionsRegion)
  : getFunctions(app);

if (typeof window !== "undefined") {
  const appCheckSiteKey =
    import.meta.env.VITE_FIREBASE_APP_CHECK_SITE_KEY?.trim() || "";
  const appCheckDebugToken =
    import.meta.env.VITE_FIREBASE_APP_CHECK_DEBUG_TOKEN?.trim() || "";

  if (appCheckDebugToken) {
    (window as any).FIREBASE_APPCHECK_DEBUG_TOKEN = appCheckDebugToken;
  }

  if (appCheckSiteKey) {
    initializeAppCheck(app, {
      provider: new ReCaptchaV3Provider(appCheckSiteKey),
      isTokenAutoRefreshEnabled: true,
    });
  }
}

if (typeof window !== "undefined") {
  console.info("[Firebase] runtime config", {
    projectId: firebaseConfig.projectId,
    appId: firebaseConfig.appId,
    usingEnvConfig: hasCompleteEnvFirebaseConfig,
    functionsRegion: firebaseFunctionsRegion || "default",
  });
  if (!hasCompleteEnvFirebaseConfig && import.meta.env.PROD) {
    console.warn(
      "[Firebase] Production is using fallback Firebase config. Set VITE_FIREBASE_* values for each environment.",
    );
  }
}
