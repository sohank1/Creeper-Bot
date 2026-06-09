# Fortnite Map Commands Implementation

## Overview

Implement two new subcommands under the `/fortnite map` group in Discord to provide detailed and historical map information.

1. `/fortnite map view`: Shows detailed map information and allows searching by exact POIs.
2. `/fortnite map options`: Showcases the history of all available map versions.

## Data Management & Automation

### Local Caching via GitHub Actions

Since detailed POI data must be individually fetched from the API for each map version and we need comprehensive data for autocomplete:

- A script will fetch and save all map and POI data to a local JSON file repository.
- A GitHub Action scheduled to run daily at 12:00 AM (cron job) will check the API for new map versions.
- If a new map update is detected, the action will run the fetch script, update the local JSON files, and automatically commit and push the changes to the GitHub repository.
- The bot will load this local data into memory on startup for lightning-fast autocomplete, completely eliminating the need for real-time external API calls during user typing.

## API Specification

- **API Swagger/Base:** https://prod.api-fortnite.com/swagger
  _(Note: We will primarily interact with the local cached data for autocomplete, but use these endpoints for the fetching script)_

### Endpoints

1. **Endpoint:** `/api/v1/map/history`
   - **Method:** GET
   - **Description:** Returns an array of historical map versions.

2. **Endpoint:** `/api/v1/map`
   - **Method:** GET
   - **Description:** Returns detailed map data including Points of Interest (POIs).

### Response Data Structures

**Map History Response:**

```typescript
type MapHistoryResponse = {
  version: string;
  chapter: number;
  season: number;
  patch: string;
  releaseDate: string;
  hasImage: boolean;
  imageUrl: string;
  hasPois: boolean;
}[];
```

**Map Detailed Response:**

```typescript
type MapDetailedResponse = {
  version: string;
  chapter: number;
  season: number;
  patch: string;
  releaseDate: string;
  imageUrl: string;
  pois: {
    name: string;
    x: number;
    y: number;
    type: string;
  }[];
};
```

## Command Details

### 1. `/fortnite map options`

- **Purpose:** Display the history of available map versions interactively and allow users to view them by clicking buttons.
- **UI Components & Pagination:**
  - **Select Menus (Rows 1 & 2):** Provide cascading menus for `Chapter` and `Season`.
    - _Dependency Logic:_ When a Chapter is selected, the Season menu must dynamically recompute its options so users cannot select a season that doesn't exist for that chapter (e.g., if Chapter 2 is selected, hide Season 9).
  - **Version Buttons & Pagination (Rows 3-5):** Display individual interactive buttons for each map version in the selected season.
    - _Button Action:_ Clicking a version button triggers the same map image response as the `/fortnite map view <version>` command.
    - _Pagination Logic:_ Discord limits messages to 5 Action Rows (max 25 buttons). Because rows are used for Select Menus and pagination controls, the number of version buttons displayed at once is limited. If a season has many versions (like Chapter 2 Season 3's numerous water levels or Chapter 1's content patches), generate "Previous Page" and "Next Page" buttons to navigate through the chunks of versions.
- **Embed Content:**
  - Display the historical versions within the selected chapter/season (and current page).
  - Properly format custom version codenames (e.g., parse `13_30-(water-lvl-1)` into "v13.30 (Water Level 1)") so they are easily readable in the map history list and on the buttons.
  - Attempt to integrate an API or static mapping for Season Titles (e.g., "Chapter 7 Season 3: Runners") to enrich the embed title.

### 2. `/fortnite map view <version>`

- **Purpose:** Display the exact map image and details for a specific version.
- **Autocomplete Feature (`<version>` argument):**
  - **Data Source:** Read from the locally cached JSON data.
  - **Typo-Tolerant Combined Search:** Utilize the existing `fuse.js` library to perform a unified, typo-tolerant search across **both POIs and Version strings** simultaneously.
  - **Advanced Two-Pass Algorithm & Prioritization:**
    Because Discord limits autocomplete options to **25 results**, we must employ a "smart" two-pass strategy combining `fuse.js` filtering with intent-aware custom sorting.
    1. **Pass 1: Fuzzy Filtering & Intent Detection**
       - Run the raw query through `fuse.js` (indexing `version`, `chapter`, `season`, `pois.name`, and **custom version codenames** extracted from the version string like "water level", "week", "stage", "snow").
       - **Intent Detection:** Parse the query to determine what the user is specifically looking for.
         - _Major Version Intent:_ e.g., "Tilted", "Tilted Chapter 2", "Salty Season 4".
         - _Minor Version Intent:_ e.g., "Tilted v4", "Salty v12.10".
         - _Codename Intent:_ e.g., "Tilted Water Level 2", "Week 3", "Snow".

    2. **Pass 2: Smart Sorting & Filling**
       - Group the `fuse.js` results into **Major Versions** (strings ending in `.00`), **Minor Versions**, and **Codename Versions** (versions containing special descriptors like "week", "water-lvl", "stage", etc.).
       - **If Major Intent (or general POI search like "Tilted"):**
         - _Priority 1:_ Push all matching Major Versions (`.00`) to the top of the list, sorted newest to oldest. (If "Tilted Chapter 2" was searched, only Chapter 2 major seasons with Tilted will surface here.) Vice versa for "Tilted season 2": list all season 2s that had tilted at the top and then move through minor versions after.
         - _Priority 2:_ If the Discord maximum of 25 results has not been reached, backfill the remaining slots with Codename Versions, then Minor Versions, grouped closely to their parent seasons.
       - **If Minor Intent (e.g., "Tilted v4"):**
         - _Priority 1:_ Skip the `.00` prioritization rule. Explicitly push minor patches starting with `v4` (e.g., `v4.0`, `v4.1`, `v4.2`) to the top, sorted correctly.
       - **If Codename Intent (e.g., "Water Level 1"):**
         - _Priority 1:_ Heavily prioritize the exact versions containing the matching codename modifier (e.g., `-(water-lvl-1)`).
    - **Empty String Behavior:**
      - If the user types nothing (empty string), list the **newest 3 versions** first, followed by the **newest major seasons** to fill the remaining slots.
    - **Search Behavior:**
      - For the rest of the search queries, ONLY search for minor versions unless the user explicitly types intent for major versions (e.g., typing 'chapter', 'season', or explicitly typing '.00').
    - **Improvements for "Smart" Results:**
      - Deduplication: If a POI didn't move or change between `v8.10` and `v8.20`, prefer grouping or skipping redundant minor patches to provide a cleaner history within the 25 limit.
      - Exact Match Boost: If a user types the exact, complete name of a POI, heavily boost the ranking of the Major versions where that POI was first introduced.

  - **Label Format:**
    - Parse the raw `version` string to extract and format any custom codenames cleanly (e.g., `13_30-(water-lvl-1)` becomes `v13.30 (Water Level 1)`).
    - _Example Format (Normal):_ `v21.00 (Chapter 3, Season 3)`
    - _Example Format (Codename):_ `v13.30 (Water Level 1) (Chapter 2, Season 3)`
    - _Example Format (POI Search):_ `v21.00 (Chapter 3, Season 3) (Tilted Towers)`
    - _Example Format (Codename + POI):_ `v13.30 (Water Level 1) (Chapter 2, Season 3) (Tilted Towers)`
  - The underlying value of the selected option should correspond to the exact original `version` string (e.g., `13_30-(water-lvl-1)`).

- **Message Response & Visuals:**
  - Fetch the map image separately by making an authenticated request to the `imageUrl` using the required API key.
  - Send an embed and attach the fetched image as a Discord message attachment (e.g., using `attachment://map.png` in the embed's image property).
  - Handle cases where a user selects a version without an image gracefully.
  - **Visual POI Markers (Optional Enhancement):** If the user searched for a specific POI, use an image manipulation library (e.g., `canvas`) to draw a marker/pin onto the fetched map image at the exact `x` and `y` coordinates provided by the API before attaching and sending it.
