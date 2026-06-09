export const TRANSACTION_LOCATION_TEXT_MAX_LENGTH = 255;
export const TRANSACTION_LOCATION_URL_MAX_LENGTH = 500;

export type NormalizedTransactionLocationMetadata = {
	manualDescription: string | null;
	locationName: string | null;
	googleMapsUrl: string | null;
};

export function normalizeOptionalCoordinate(value: unknown): number | null {
	if (value === undefined || value === null || value === '') {
		return null;
	}

	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : null;
}

function normalizeOptionalTrimmedString(value: unknown): string | null {
	if (typeof value !== 'string') {
		return null;
	}

	const normalized = value.trim();
	return normalized || null;
}

function isValidUrl(value: string): boolean {
	try {
		const parsedUrl = new URL(value);
		return Boolean(parsedUrl);
	} catch {
		return false;
	}
}

export function normalizeTransactionLocationMetadata(input: {
	manualDescription?: unknown;
	locationName?: unknown;
	googleMapsUrl?: unknown;
}): NormalizedTransactionLocationMetadata {
	const manualDescription = normalizeOptionalTrimmedString(input.manualDescription);
	const locationName = normalizeOptionalTrimmedString(input.locationName);
	const googleMapsUrl = normalizeOptionalTrimmedString(input.googleMapsUrl);

	if (manualDescription && manualDescription.length > TRANSACTION_LOCATION_TEXT_MAX_LENGTH) {
		throw new Error(`manualDescription must be ${TRANSACTION_LOCATION_TEXT_MAX_LENGTH} characters or fewer`);
	}

	if (locationName && locationName.length > TRANSACTION_LOCATION_TEXT_MAX_LENGTH) {
		throw new Error(`locationName must be ${TRANSACTION_LOCATION_TEXT_MAX_LENGTH} characters or fewer`);
	}

	if (googleMapsUrl) {
		if (googleMapsUrl.length > TRANSACTION_LOCATION_URL_MAX_LENGTH) {
			throw new Error(`googleMapsUrl must be ${TRANSACTION_LOCATION_URL_MAX_LENGTH} characters or fewer`);
		}

		if (!isValidUrl(googleMapsUrl)) {
			throw new Error('googleMapsUrl must be a valid URL');
		}
	}

	return {
		manualDescription,
		locationName,
		googleMapsUrl,
	};
}
