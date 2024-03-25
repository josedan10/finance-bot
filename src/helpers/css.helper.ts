export function convertStringIntoCSSSelectorClasses(str: string): string {
	return str
		.split(' ')
		.map((word: string) => (word !== '' ? `.${word}` : ''))
		.join('');
}
