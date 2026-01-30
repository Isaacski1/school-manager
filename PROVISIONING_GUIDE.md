# Backend Provisioning and IAM Setup

To run the Express backend server, you must provide it with a Firebase Service Account that has the necessary permissions to manage users and interact with other Google Cloud services.

## 1. Create a Firebase Service Account

1.  Navigate to the **Firebase Console** and open your project.
2.  Click the gear icon next to **Project Overview** and select **Project settings**.
3.  Go to the **Service accounts** tab.
4.  Click the **Create service account** button (or select an existing one if appropriate).
5.  Click the **Generate new private key** button. A JSON file will be downloaded.
6.  **Important:** Store this file securely. It contains private credentials that grant administrative access to your Firebase project. **Do not commit it to version control.** Rename this file to `serviceAccountKey.json` or a name of your choice.

## 2. Set Environment Variables

The backend server requires the service account credentials to be provided via an environment variable.

*   **Option A: (Recommended) Use `GOOGLE_APPLICATION_CREDENTIALS`**

    This is the standard method used by Google Cloud libraries. Set the environment variable to the *absolute path* of your downloaded JSON key file.

    *   On Windows (Command Prompt):
        ```shell
        set GOOGLE_APPLICATION_CREDENTIALS="C:\path\to\your\serviceAccountKey.json"
        ```
    *   On Windows (PowerShell):
        ```shell
        $env:GOOGLE_APPLICATION_CREDENTIALS="C:\path\to\your\serviceAccountKey.json"
        ```
    *   On macOS/Linux:
        ```shell
        export GOOGLE_APPLICATION_CREDENTIALS="/path/to/your/serviceAccountKey.json"
        ```

*   **Option B: Use `FIREBASE_SERVICE_ACCOUNT_KEY`**

    Our server also supports providing the credentials as a raw JSON string in this variable. This can be useful in hosting environments that don't allow file storage but do allow multi-line environment variables.

    1.  Open your downloaded JSON key file in a text editor.
    2.  Copy the *entire content* of the file.
    3.  Set the `FIREBASE_SERVICE_ACCOUNT_KEY` environment variable to the copied JSON string.

## 3. Assign Required IAM Roles

The service account you created needs specific permissions (IAM roles) to function correctly.

1.  Navigate to the **Google Cloud Console IAM & Admin** page for your project.
2.  Find the service account you created (it will be named something like `firebase-adminsdk-...@<project-id>.iam.gserviceaccount.com`).
3.  Click the pencil icon to edit its roles.
4.  Add the following required roles:
    *   **Service Usage Consumer (`roles/serviceusage.serviceUsageConsumer`):** Allows the backend to use the Identity Toolkit API for creating users. This fixes the `USER_PROJECT_DENIED` error.
    *   **Firebase Authentication Admin (`roles/firebase.authAdmin`):** Grants full access to manage Firebase Authentication users.
    *   **Cloud Firestore User (`roles/datastore.user`):** Allows the backend to read and write user data in Firestore (e.g., for checking roles).

After completing these steps and restarting the server, the `PERMISSION_DENIED` errors should be resolved.