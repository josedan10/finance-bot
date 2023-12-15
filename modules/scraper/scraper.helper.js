import fs from 'fs';

export function sleep(ms = 3000) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

export function randomSleep(min = 1000, max = 5000) {
	const random = Math.random() * (max - min) + min;
	return sleep(random);
}

export function getScreenshotsByTaskId(taskId) {
	try {
		const pathName = `./screenshots/${taskId}`;
		const imagesPathNames = fs.readdirSync(pathName);
		return imagesPathNames.map((imagePathName) => {
			return { path: `${pathName}/${imagePathName}`, caption: `Task num ${taskId}: ${imagePathName}` };
		});
	} catch (err) {
		console.error(err);
		return [];
	}
}
