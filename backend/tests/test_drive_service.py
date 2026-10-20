from app.services.drive_service import DriveService


class Request:
    def __init__(self, result): self.result = result
    def execute(self): return self.result


class Files:
    def __init__(self): self.created = []
    def list(self, **kwargs): return Request({"files": []})
    def create(self, **kwargs):
        self.created.append(kwargs)
        return Request({"id": f"folder-{len(self.created)}"})
    def get_media(self, **kwargs): return Request(b"file-content")
    def delete(self, **kwargs): return Request({})


class Client:
    def __init__(self): self.api = Files()
    def files(self): return self.api


def test_drive_upload_creates_private_project_and_bug_folders_then_uploads():
    client = Client()
    storage = DriveService(client=client)
    file_id = storage.upload(project_id=7, bug_no=12, file_name="screen.png", mime_type="image/png", content=b"png")
    assert file_id == "folder-3"
    assert len(client.api.created) == 3
    assert client.api.created[0]["body"]["name"] == "project-7"
    assert client.api.created[1]["body"]["name"] == "bug-12"
    assert client.api.created[2]["body"]["name"] == "screen.png"


def test_drive_service_download_and_delete_are_mockable():
    storage = DriveService(client=Client())
    assert storage.download("drive-id") == b"file-content"
    storage.delete("drive-id")
