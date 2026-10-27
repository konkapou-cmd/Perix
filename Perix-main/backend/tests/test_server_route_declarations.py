"""Check route registration syntax without importing server/startup/database."""
import ast
from pathlib import Path


def test_account_deletion_confirmation_is_a_separate_registered_route():
    module = ast.parse((Path(__file__).parents[1] / "server.py").read_text(encoding="utf-8"))
    functions = {node.name: node for node in module.body if isinstance(node, ast.AsyncFunctionDef)}
    route = functions["account_deletion_confirm_page"]
    assert any(
        isinstance(decorator, ast.Call)
        and isinstance(decorator.func, ast.Attribute)
        and decorator.func.attr == "get"
        and decorator.args
        and isinstance(decorator.args[0], ast.Constant)
        and decorator.args[0].value == "/account-deletion/confirm"
        for decorator in route.decorator_list
    )
    returned = functions["account_deletion_page"].body[0]
    assert isinstance(returned, ast.Return) and isinstance(returned.value, ast.Call)
