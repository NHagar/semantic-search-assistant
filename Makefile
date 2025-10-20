.PHONY: dev clean

dev:
	@echo "Starting backend and frontend..."
	@trap 'kill 0' EXIT; \
	uv run app.py & \
	(cd frontend && bun install && bun run dev) & \
	wait

clean:
	@echo "Cleaning up processes..."
	@pkill -f "uv run app.py" || true
	@pkill -f "bun run dev" || true
