# VolleyScout Pro 🏐

A professional, mobile-first volleyball scouting and scorekeeping web application. Designed to replace pen-and-paper tracking with an intuitive, app-like interface for coaches and analysts.

![VolleyScout Preview](https://placehold.co/600x400/111/fff?text=VolleyScout+Pro)

## Features

*   **Mobile-First Design**: Optimized for phone screens with a dark mode interface.
*   **Real-time Scorekeeping**: Track scores for both teams with automatic rotation logic.
*   **Visual Court Interface**: Tap to select players and drag to record ball placement.
*   **Rotation Management**: visualize player positions and handle substitutions.
*   **Action Logging**: Record serves, attacks, blocks, digs, and errors.
*   **Undo/Redo**: Full history support for correcting mistakes.
*   **CSV Export**: Download detailed match logs for analysis.

## Tech Stack

*   **Framework**: React 19 + TypeScript
*   **Styling**: Tailwind CSS
*   **State Management**: React Hooks (useReducer/useState)

## Getting Started

This project is built as a standard React application.

1.  Clone the repository.
2.  Install dependencies (if using a bundler).
3.  Run the application.

## Usage

1.  **Setup**: Enter team names and starting lineups (Pos 1-6).
2.  **Play**:
    *   Tap a player on the court.
    *   Select an action (Serve, Attack, etc.).
    *   (Optional) Drag on the court to record start/end locations.
    *   Select the result (Point, Error, Normal).
3.  **Export**: Click "匯出 CSV" at the top to download the match data.

## License

MIT
