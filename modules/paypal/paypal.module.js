export class PaypalModule {
	constructor() {
		this.name = 'Paypal';
		this.columnNames = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'J', 'M', 'P', 'AL', 'AM', 'AO'];
		this.columnIndexes = this.columnNames.map((columnName) => this.getColumnIndex(columnName));
		this.numberOfColumns = 41;
	}

	// Función para calcular el índice de una columna de Excel basado en su nombre
	getColumnIndex(columnName) {
		let index = 0;
		for (let i = 0; i < columnName.length; i++) {
			const charCode = columnName.charCodeAt(i) - 65; // obtener el valor numérico de la letra - 1
			index += charCode + 26 * i; // sumar el valor numérico de la letra multiplicado por 26 elevado a la posición de la letra en el nombre de la columna
		}

		return index;
	}

	getDataFromCSVData(csvData) {
		if (!csvData || !csvData.length || csvData.some((row) => row.length < this.numberOfColumns)) return [];
		// Crear una matriz para almacenar los valores extraídos
		const extractedValues = [];

		// Iterar sobre las filas y extraer los valores de las columnas correspondientes a los índices especificados
		csvData.forEach((row) => {
			const extractedRow = [];
			this.columnIndexes.forEach((index) => {
				extractedRow.push(row[index]);
			});
			extractedValues.push(extractedRow);
		});

		return extractedValues;
	}
}

export const PayPal = new PaypalModule();
