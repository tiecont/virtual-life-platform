"""Measure a matched high/low/normal render comparison on common opaque foreground."""
import argparse
import json
from pathlib import Path

import numpy as np
from PIL import Image


def compare(folder, view):
    def load(variant):
        with Image.open(folder / f"{view}-{variant}.png") as image:
            if image.size != (512, 512) or image.mode != "RGBA":
                raise ValueError("Expected lossless 512-square RGBA captures")
            return np.asarray(image).astype(float)
    high, low, baked = (load(variant) for variant in ("master", "lod", "baked"))
    mask = (high[:, :, 3] == 255) & (low[:, :, 3] == 255) & (baked[:, :, 3] == 255)
    if mask.sum() < 500:
        raise ValueError("Unusable common opaque foreground")
    return {"opaqueCommonPixels": int(mask.sum()), "lodError": float(abs(high[mask,:3]-low[mask,:3]).mean()),
            "bakedError": float(abs(high[mask,:3]-baked[mask,:3]).mean()),
            "silhouettePixelsChangedByNormal": int((low[:,:,3] != baked[:,:,3]).sum())}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("folder", type=Path)
    args = parser.parse_args()
    print(json.dumps({view: compare(args.folder, view) for view in ("side", "oblique")}, indent=2))
