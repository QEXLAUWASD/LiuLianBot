from fuction.r6Roll.randomops import random_operator


async def r6opsroll(message, bot):
	parts = message.content.split()
	side_arg = parts[1] if len(parts) > 1 else None

	try:
		result = random_operator(side_arg)
	except Exception as exc:  # pragma: no cover - defensive
		return f"Roll failed: {exc}"

	side_label = "Attacker" if result.get("side") == "Att" else "Defender"
	lines = [
		f"🎲 {side_label}: {result.get('name', 'Unknown')}",
		f"Primary: {result.get('primary', 'N/A')}",
		f"Secondary: {result.get('secondary', 'N/A')}",
		f"Gadget: {result.get('gadget', 'N/A')}",
	]

	return "\n".join(lines)