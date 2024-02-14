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

export function extractTransactionDetails(data) {
	// data is an array of strings, we need to join them to get a single string
	const dataInArray = data?.join(' ')?.split('\n');

	const totalLine = dataInArray?.find((d) => d.toLowerCase().includes('total'));
	let amount;
	let date;

	// AMOUNT
	const cleanLine = totalLine?.replaceAll(' ', '');
	// Regex to get numbers, commas and dots
	const amountMatch = cleanLine?.match(/(\d+,\d+.\d+|\d+.\d+|\d+,\d+|\d+)/);

	if (amountMatch && amountMatch?.[1]) {
		// if the comma is the decimal separator, replace it with a dot
		const reverseAmountString = amountMatch[1].split('').reverse().join('');

		// If the comma is the third character, and there is only 1 comma, then the decimal separator is a comma
		if (reverseAmountString[2] === ',' && reverseAmountString.split(',').length === 2) {
			amount = parseFloat(amountMatch[1].replaceAll(',', '.'));
		} else {
			amount = parseFloat(amountMatch[1].replaceAll(',', ''));
		}
	} else {
		throw new Error('Amount not found');
	}

	// DATE
	const dateLine = dataInArray?.find((d) => d.toLowerCase().includes('fecha'));
	// Date can be in the format DD/MM/YYYY or DD-MM-YYYY
	const dateMatch = dateLine?.match(/(\d{2}\/\d{2}\/\d{4}|\d{2}-\d{2}-\d{4})/);

	console.log('dateMatch', dateMatch);

	if (dateMatch && dateMatch?.[1]) {
		// convert to YYYY-MM-DD
		const dateParts = dateMatch[1]?.replaceAll('/', '-')?.split('-');

		if (dateParts?.length === 3) {
			date = `${dateParts[2]}-${dateParts[1]}-${dateParts[0]}`;
		}
	}

	return { amount, date };
}
