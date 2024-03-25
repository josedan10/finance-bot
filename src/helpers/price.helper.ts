export function extractPriceFromInstagramDescription(text: string): number | null {
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

export function extractDateFromDescription(text: string): string | null {
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

export function getTotalFromDataText(data: string[]): number | null {
	const regex = /(\d+,\d+.\d+|\d+.\d+,\d+|\d+.\d+|\d+,\d+|\d+.\d+|\d+)/;
	const option =
		data?.find((d) => d.toLowerCase().includes('total') && regex.test(d)) ||
		data?.reverse()?.find((d) => d.toLowerCase().includes('bs') && regex.test(d));
	const totalMatch = option?.replaceAll(' ', '')?.match(regex);
	const totalStr = totalMatch?.[0];

	if (totalStr) {
		const commaPosition = totalStr.indexOf(',');
		const dotPosition = totalStr.indexOf('.');

		if (commaPosition < dotPosition && commaPosition !== -1 && dotPosition !== -1) {
			// comma is the decimal separator
			return parseFloat(totalStr.replaceAll(',', ''));
		} else if (dotPosition < commaPosition && commaPosition !== -1 && dotPosition !== -1) {
			// dot is the decimal separator
			const total = totalStr.replaceAll('.', '').replace(',', '.');
			return parseFloat(total);
		} else if (dotPosition === -1) {
			// comma is the decimal separator
			return parseFloat(totalStr.replaceAll(',', '.'));
		}

		return parseFloat(totalStr);
	}

	return null;
}

export function extractTransactionDetails(data: string[]): { amount: number | null; date: string | null } {
	// data is an array of strings, we need to join them to get a single string
	const dataInArray = data?.join(' ')?.split('\n');

	let amount: number | null = null;
	amount = getTotalFromDataText(dataInArray);
	let date: string | null = null;

	// DATE
	const dateLine = dataInArray?.find((d) => d.toLowerCase().includes('fecha'));
	// Date can be in the format DD/MM/YYYY or DD-MM-YYYY
	const dateMatch = dateLine?.replaceAll(' ', '')?.match(/(\d{2}\/\d{2}\/\d{4}|\d{2}-\d{2}-\d{4})/);

	if (dateMatch && dateMatch?.[1]) {
		// convert to YYYY-MM-DD
		const dateParts = dateMatch[1]?.replaceAll('/', '-')?.split('-');

		if (dateParts?.length === 3) {
			date = `${dateParts[2]}-${dateParts[1]}-${dateParts[0]}`;
		}
	}

	return { amount, date };
}
