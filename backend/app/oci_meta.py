"""OCI 인스턴스 메타데이터(IMDS v2) 조회.

콘솔 권한 없이 인스턴스 안에서 자기 자신의 정보를 읽는다.
  GET http://169.254.169.254/opc/v2/instance/   (헤더 Authorization: Bearer Oracle)
OCI 밖(로컬 PC 등)에서는 1초 안에 실패하고 on_oci=False 로 돌려준다.
"""
import json
import socket
import time
import urllib.request

from .config import settings

_CACHE: dict = {"at": 0.0, "data": None}
_TTL = 60


def _get(path: str) -> dict | list | None:
    req = urllib.request.Request(
        f"{settings.oci_metadata_url}/{path}", headers={"Authorization": "Bearer Oracle"}
    )
    # IMDS는 프록시를 타면 안 된다
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    with opener.open(req, timeout=1.0) as resp:
        return json.loads(resp.read().decode())


def instance_info() -> dict:
    now = time.time()
    if _CACHE["data"] is not None and now - _CACHE["at"] < _TTL:
        return _CACHE["data"]

    data: dict = {"on_oci": False, "container_hostname": socket.gethostname()}
    if settings.oci_metadata_url:
        try:
            inst = _get("instance/")
            shape_cfg = inst.get("shapeConfig") or {}
            data.update(
                on_oci=True,
                display_name=inst.get("displayName"),
                instance_id=inst.get("id"),
                region=inst.get("canonicalRegionName") or inst.get("region"),
                region_key=inst.get("region"),
                availability_domain=inst.get("availabilityDomain"),
                fault_domain=inst.get("faultDomain"),
                shape=inst.get("shape"),
                ocpus=shape_cfg.get("ocpus"),
                memory_gb=shape_cfg.get("memoryInGBs"),
                compartment_id=inst.get("compartmentId"),
                image_id=inst.get("image"),
                time_created=inst.get("timeCreated"),
            )
            try:
                vnics = _get("vnics/")
                if vnics:
                    data["private_ip"] = vnics[0].get("privateIp")
            except Exception:  # noqa: BLE001
                pass
        except Exception as exc:  # noqa: BLE001
            data["reason"] = f"메타데이터 서비스에 연결할 수 없음 ({type(exc).__name__})"

    _CACHE.update(at=now, data=data)
    return data
