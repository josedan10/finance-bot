class ExcelModule {
	// constructor() {}
	parseCSVDataToJs(csvData, shiftCount = 1) {
		const data = csvData.split('\n').map((row) => {
			const cleanRow = row.split(',').map((value) => value.replace('\r', '').trim());
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
