# Fortnite Map View Command Implementation

## Overview
Implement the `/fortnite map view` Discord command. This command will allow users to view historical Fortnite maps by selecting a specific version. It also supports searching for maps based on specific Points of Interest (POIs).

## API Specification
- **API Swagger/Base:** https://prod.api-fortnite.com/swagger

### Endpoints
1. **Endpoint:** `/api/v1/map/history`
   - **Method:** GET
   - **Description:** Returns an array of historical map versions.

2. **Endpoint:** `/api/v1/map`
   - **Method:** GET
   - **Description:** Returns detailed map data including Points of Interest (POIs) for a specific version.

### Response Data Structures

**Map History Response (`/api/v1/map/history`):**
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

**Map Detailed Response (`/api/v1/map`):**
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

## Features & Requirements

1. **Command Structure:** 
   - Root command: `/fortnite`
   - Subcommand group: `map`
   - Subcommand: `view`
   - Target usage: `/fortnite map view <version>`

2. **Autocomplete Feature:**
   - The `version` parameter must use Discord's autocomplete feature.
   - The autocomplete options should fetch and merge data from the map endpoints.
   - **Search Logic:**
     - Filter options based on the user's current input (searching by version number, chapter, season, or POI name).
     - If the user searches by a POI name, ensure the bot searches through the map versions that contain that POI.
   - **Display Label Format:**
     - The display label for each option should clearly list the version number, chapter, and season.
     - If a POI was searched for and found in a specific version, append the POI name in parentheses at the end of the label.
     - *Example Format (Normal):* `v21.00 (Chapter 3, Season 3)`
     - *Example Format (POI Search):* `v21.00 (Chapter 3, Season 3) (Tilted Towers)`
   - The underlying value of the selected option should correspond to the specific `version` string.

3. **Message Response:**
   - Once a version is selected and the command is executed, the bot should send an embed or message containing the `imageUrl` from the selected map.
   - Only options where `hasImage: true` should ideally be shown, or the bot should gracefully handle cases where a user selects a version without an image.