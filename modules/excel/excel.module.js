class ExcelModule {
	// constructor() {}
	parseCSVDataToJs(csvData, shiftCount = 1) {
		const data = csvData.split('\n').map((row) => {
			// eslint-disable-next-line no-useless-escape
			const regex = /(\"[^\"]+\")/g;
			const result = row.replace(regex, function (match) {
				return match.replace(/,/g, '&comma;');
			});
			const cleanRow = result.split(',').map((value) => value.replace('\r', '').trim());
			return cleanRow;
		});

		for (let i = 0; i < shiftCount; i++) {
			// Remove the titles
			data.shift();
		}
		return data;
	}
}

export default new ExcelModule();
