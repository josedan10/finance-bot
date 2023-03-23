import path from 'path';
import { fileURLToPath } from 'url';
import ExcelModule from '../../modules/excel/excel.module.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function getPDF(req, res) {
	ExcelModule.readPDF(path.join(__dirname, '../../sample-excels/MERCANTIL ENE2023.xlsx')).then((result) => {
		res.send(result);
	});
}
