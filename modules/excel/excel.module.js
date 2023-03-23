class ExcelModule {
	// constructor() {}
	parseCSVDataToJs(csvData) {
		const data = csvData.split('\n').map((row) => {
			const cleanRow = row.split(',').map((value) => value.replace('\r', '').trim());
			return cleanRow;
		});

		// Remove the titles
		data.shift();
		data.shift();

		return data;
	}
}

export default new ExcelModule();
