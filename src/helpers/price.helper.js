export function extractPriceFromInstagramDescription(text) {
	// Regular expression pattern to match the price
	const regex = /💵 Bs\. (\d{1,5},\d{2}?)/;

	// Extract the price using the regular expression
	const match = text.match(regex);

	// Check if a match is found and extract the price value
	if (match && match.length > 1) {
		return parseFloat(match[1].replace(',', '.'));
	}

	return null;
}

export function extractDateFromDescription(text) {
	// Regular expression pattern to match the date
	const regex = /🗓 (\d{2}\/\d{2}\/\d{4})/;

	// Extract the date using the regular expression
	const match = text.match(regex);

	// Check if a match is found and extract the date value
	if (match && match.length > 1) {
		return match[1];
	}

	return null;
}
