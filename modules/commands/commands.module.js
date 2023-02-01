class CommandsModule {
	constructor() {
		this.commands = {
			cashTransaction: async (data) => {
				console.log(data);
				return 'Cash transaction';
			},
			test: async (data) => data,
		};
	}

	async executeCommand(command, data) {
		if (this.commands[command]) {
			return this.commands[command](data);
		}

		throw new Error(`Command ${command} not found`);
	}
}

export default new CommandsModule();
