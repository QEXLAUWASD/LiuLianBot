from types import SimpleNamespace


def test_interaction_message_defaults_role_mentions_to_empty_list():
    from core.slash_adapter import _create_interaction_message

    interaction = SimpleNamespace(
        user=SimpleNamespace(id=1),
        channel=SimpleNamespace(),
        guild=None,
    )

    message = _create_interaction_message(interaction, ">help")

    assert message.content == ">help"
    assert message.role_mentions == []
