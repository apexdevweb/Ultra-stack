import io, os, uuid, threading
import numpy as np, rembg, torch
from fastapi import FastAPI, File, Form, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from PIL import Image
from tsr.system import TSR
from tsr.utils import remove_background, resize_foreground

device = "cuda:0" if torch.cuda.is_available() else "cpu"
model = TSR.from_pretrained("stabilityai/TripoSR",
                            config_name="config.yaml", weight_name="model.ckpt")
model.renderer.set_chunk_size(8192)
model.to(device)
rembg_session = rembg.new_session()
gpu_lock = threading.Lock()          # une génération à la fois

app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["*"],   # test local seulement
                   allow_methods=["*"], allow_headers=["*"])
os.makedirs("out", exist_ok=True)

@app.post("/generate")
def generate(file: UploadFile = File(...),
             remove_bg: str = Form("1"),
             resolution: int = Form(256)):
    image = Image.open(io.BytesIO(file.file.read()))
    if remove_bg == "1":
        image = remove_background(image.convert("RGB"), rembg_session)
        image = resize_foreground(image, 0.85)
        a = np.array(image).astype(np.float32) / 255.0
        a = a[:, :, :3] * a[:, :, 3:4] + (1 - a[:, :, 3:4]) * 0.5
        image = Image.fromarray((a * 255.0).astype(np.uint8))
    else:
        image = image.convert("RGB")

    resolution = max(128, min(resolution, 384))
    with gpu_lock, torch.no_grad():
        codes = model([image], device=device)
        mesh = model.extract_mesh(codes, True, resolution=resolution)[0]

    path = f"out/{uuid.uuid4().hex}.glb"
    mesh.export(path)
    return FileResponse(path, media_type="model/gltf-binary")