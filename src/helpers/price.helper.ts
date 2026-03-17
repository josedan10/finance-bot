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
	const amountRegex = /(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})|\d+[.,]\d+|\d+)/;
	const lineWithTotal = data?.find((d) => d.toLowerCase().includes('total') && amountRegex.test(d));
	const lineWithBs = !lineWithTotal ? [...(data || [])].reverse().find((d) => d.toLowerCase().includes('bs') && amountRegex.test(d)) : null;
	
	const option = lineWithTotal || lineWithBs;
	
	if (option) {
		// Clean the string to keep only relevant parts for amount extraction
		// We remove everything before 'total' or 'bs' to avoid capturing dates
		const lowerOption = option.toLowerCase();
		const startIndex = Math.max(lowerOption.indexOf('total'), lowerOption.indexOf('bs'));
		const relevantPart = option.substring(startIndex).replaceAll(' ', '');
		
		const totalMatch = relevantPart.match(amountRegex);
		const totalStr = totalMatch?.[0];

		if (totalStr) {
			// If there's both a comma and a dot
			if (totalStr.includes(',') && totalStr.includes('.')) {
				const commaPos = totalStr.indexOf(',');
				const dotPos = totalStr.indexOf('.');
				
				if (commaPos < dotPos) {
					// 1,500.50 -> comma is thousands, dot is decimal
					return parseFloat(totalStr.replaceAll(',', ''));
				} else {
					// 1.500,50 -> dot is thousands, comma is decimal
					return parseFloat(totalStr.replaceAll('.', '').replace(',', '.'));
				}
			}
			
			// If there's only a comma
			if (totalStr.includes(',') && !totalStr.includes('.')) {
				// We assume it's decimal if it looks like one (e.g. 10,50) 
				// or if it's the only separator
				return parseFloat(totalStr.replace(',', '.'));
			}
			
			// If there's only a dot or no separator
			return parseFloat(totalStr);
		}
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
