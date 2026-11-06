from flask import jsonify


def api_error(type_: str, message: str, status: int):
    return jsonify({"success": False, "error": {"type": type_, "message": message}}), status