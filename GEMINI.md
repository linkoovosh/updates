# MurCHAT Development Log

## v0.0.52 - The "Icons & Style" Update (Current)

### ✨ New Features
*   **SVG Overhaul:**
    *   Replaced legacy emojis (📷, 🖼️) in Account Settings with modern SVG icons (`CameraIcon`, `ImageIcon`).
    *   Added `SmileIcon` and `FilmIcon` to the UI library.
    *   Replaced emojis in `ExpressionPicker` tabs with consistent SVG icons.
*   **Enhanced Customization:**
    *   **Transparent Accent:** Added an option to set a "transparent" accent color with a checkerboard preview and robust CSS handling.
    *   **Theme Emojis:** Reverted theme selection icons to expressive emojis for a more vibrant "Profile" section.
    *   **Cat Mode Everywhere:** Integrated the animated "Neko Mode" background (drifting paws and cat heads) into the `AuthScreen`, creating a seamless experience from login to chat.
*   **UI/UX Polish:**
    *   **Holographic Overlays:** Implemented smooth blur-in overlays for profile editing with proper hover states.
    *   **Styled Security:** Redesigned the "Change Password" button with a glassmorphism look and a red "warning" glow on hover.
    *   **Fixed Interactivity:** Resolved a bug where the avatar edit overlay blocked clicks; the entire avatar wrapper is now a hit-zone.

### 🛠 Technical
*   **Icons Library:** Expanded `murchat/src/components/UI/Icons.tsx` with new reusable SVG components.
*   **CSS Architecture:** Added dedicated styles for edit overlays and color pickers in `SettingsPanel.css`.
*   **Robustness:** Updated `App.tsx` logic to gracefully handle non-hex color values (like `transparent`).

## v0.0.49 - The "Content & Control" Update

### ✨ New Features
*   **File Attachments:** 
    *   Drag & Drop support in chat.
    *   Clipboard paste support (Ctrl+V) for images/files.
    *   Backend storage for DM attachments (persistent) and Server attachments (ephemeral relay).
    *   Visual preview for images and file cards for other types.
*   **Rich Text Editor:**
    *   Full Markdown support (Bold, Italic, Strikethrough, Blockquotes, Lists).
    *   Syntax Highlighting for code blocks (using `react-syntax-highlighter`).
    *   Automatic link parsing.
*   **Roles & Permissions (Foundation):**
    *   Implemented `roles` and `user_roles` database tables.
    *   Backend logic for Role CRUD (`CREATE`, `UPDATE`, `DELETE`) and Member Role assignment.
    *   **Visuals:** Usernames in chat now inherit the color of their highest role in the server.

### 🛠 Technical
*   **Database:** Added `attachments` column to `direct_messages`.
*   **Store:** Updated `uiSlice` to manage `serverMembers` with roles and `currentServerRoles`.
*   **Dependencies:** Added `react-markdown`, `remark-gfm`, `react-syntax-highlighter`.

### 🔜 Next Steps
*   Role Management UI (Settings Panel).
*   Context Menu for assigning roles.
*   Enforce permissions (delete message, kick/ban) on Backend.
