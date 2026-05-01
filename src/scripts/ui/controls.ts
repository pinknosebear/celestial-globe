/**
 * UI Controls — form input handling, location/date updates.
 */

import { getTimeZoneForCoordinates, searchPlaces, reverseGeocode } from '../astronomy/geolocation';
import type { SkyState, ResolvedPlace } from '../types';

export interface ControlElements {
  placeNameInput: HTMLInputElement;
  searchPlaceButton: HTMLButtonElement;
  useMyLocationButton: HTMLButtonElement;
  placeResults: HTMLDivElement;
  locationStatus: HTMLParagraphElement;
  locationDetails: HTMLParagraphElement;
  dateInput: HTMLInputElement;
  timeInput: HTMLInputElement;
  elevationInput: HTMLInputElement;
  enableRotationCheckbox: HTMLInputElement;
  skyControls: HTMLFormElement;
  skySummary: HTMLParagraphElement;
}

/**
 * Get DOM element references from the page.
 */
export function getControlElements(): ControlElements {
  return {
    placeNameInput: document.getElementById('place-name') as HTMLInputElement,
    searchPlaceButton: document.getElementById('search-place') as HTMLButtonElement,
    useMyLocationButton: document.getElementById('use-my-location') as HTMLButtonElement,
    placeResults: document.getElementById('place-results') as HTMLDivElement,
    locationStatus: document.getElementById('location-status') as HTMLParagraphElement,
    locationDetails: document.getElementById('location-details') as HTMLParagraphElement,
    dateInput: document.getElementById('sky-date') as HTMLInputElement,
    timeInput: document.getElementById('sky-time') as HTMLInputElement,
    elevationInput: document.getElementById('elevation') as HTMLInputElement,
    enableRotationCheckbox: document.getElementById('enable-rotation') as HTMLInputElement,
    skyControls: document.getElementById('sky-controls') as HTMLFormElement,
    skySummary: document.getElementById('sky-summary') as HTMLParagraphElement,
  };
}

/**
 * Parse current form input into SkyState object.
 */
export function parseSkyStateFromControls(
  elements: ControlElements,
  currentState: SkyState
): SkyState {
  return {
    ...currentState,
    placeName: elements.placeNameInput.value.trim() || currentState.placeName,
    elevation: Number.parseFloat(elements.elevationInput.value) || 0,
    date: elements.dateInput.value || currentState.date,
    time: elements.timeInput.value || currentState.time,
  };
}

/**
 * Clear place search results.
 */
export function clearPlaceResults(elements: ControlElements): void {
  elements.placeResults.replaceChildren();
}

/**
 * Display place search results as clickable options.
 */
export function renderPlaceOptions(
  elements: ControlElements,
  results: ResolvedPlace[],
  onPlaceSelected: (place: ResolvedPlace) => void
): void {
  clearPlaceResults(elements);

  for (const result of results) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = result.name;
    button.addEventListener('click', () => {
      elements.placeNameInput.value = result.name;
      clearPlaceResults(elements);
      onPlaceSelected(result);
    });
    elements.placeResults.appendChild(button);
  }
}

/**
 * Handle place search request.
 */
export async function handlePlaceSearch(
  query: string,
  elements: ControlElements,
  onPlaceSelected: (place: ResolvedPlace) => void
): Promise<void> {
  const trimmed = query.trim();
  if (!trimmed) return;

  elements.locationStatus.textContent = 'Searching for place...';
  clearPlaceResults(elements);

  try {
    const results = await searchPlaces(trimmed);
    if (results.length === 0) {
      elements.locationStatus.textContent = 'No matching place found';
      elements.locationDetails.textContent = 'Try a broader city, region, or country name';
      return;
    }

    renderPlaceOptions(elements, results, onPlaceSelected);
    const firstResult = results[0];
    elements.placeNameInput.value = firstResult.name;
    onPlaceSelected(firstResult);
  } catch (error) {
    console.error(error);
    elements.locationStatus.textContent = 'Place search failed';
    elements.locationDetails.textContent = 'Network lookup was unavailable';
  }
}

/**
 * Handle "Use My Location" button.
 */
export async function handleUseMyLocation(
  elements: ControlElements,
  onPlaceSelected: (place: ResolvedPlace) => void
): Promise<void> {
  if (!navigator.geolocation) {
    elements.locationStatus.textContent = 'Location unavailable';
    elements.locationDetails.textContent = 'This browser does not support geolocation';
    return;
  }

  elements.locationStatus.textContent = 'Locating device...';
  clearPlaceResults(elements);

  navigator.geolocation.getCurrentPosition(
    async (position) => {
      const latitude = position.coords.latitude;
      const longitude = position.coords.longitude;
      const name = await reverseGeocode(latitude, longitude).catch(
        () => `Near ${latitude.toFixed(4)}, ${longitude.toFixed(4)}`
      );
      const place: ResolvedPlace = {
        name,
        latitude,
        longitude,
        timeZone: getTimeZoneForCoordinates(latitude, longitude),
      };
      elements.placeNameInput.value = name;
      onPlaceSelected(place);
    },
    () => {
      elements.locationStatus.textContent = 'Location unavailable';
      elements.locationDetails.textContent = 'Permission denied or device location failed';
    },
    {
      enableHighAccuracy: true,
      timeout: 10000,
    }
  );
}
