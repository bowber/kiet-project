import sys
import json
import random
from OCPP_message import *

mock_configuration = {
    'HeartbeatInterval': {'value': '60', 'readonly': False},
    'ConnectionTimeOut': {'value': '120', 'readonly': False},
    'SupportedFeatureProfiles': {'value': 'Core,RemoteTrigger,Configuration', 'readonly': True},
    'ChargeProfileMaxStackLevel': {'value': '10', 'readonly': True},
    'AllowOfflineTxForUnknownId': {'value': 'false', 'readonly': False}
}

def handle_request(action, payload, unique_id):
    """
    Xử lý một yêu cầu OCPP và trả về một thông điệp phản hồi hoàn chỉnh.
    """
    print(f"[Python DEBUG] Nhận action '{action}' với payload: {json.dumps(payload)}", file=sys.stderr)

    response_payload = {}
    
    if action == "BootNotification":
        response_payload = boot_notification_response_payload(status="Accepted")
    elif action == "Heartbeat":
        response_payload = heartbeat_response_payload()
    elif action == "Authorize":
        response_payload = authorize_response_payload(status="Accepted")
    elif action == "StatusNotification":
        response_payload = status_notification_response_payload()
    elif action == "StartTransaction":
        response_payload = start_transaction_response_payload(transaction_id=random.randint(10000, 99999))
    elif action == "MeterValues":
        response_payload = meter_values_response_payload()
    elif action == "StopTransaction":
        response_payload = stop_transaction_response_payload(status="Accepted")
    
    # --- MỚI: Xử lý các action mới ---
    elif action == "DataTransfer":
        response_payload = data_transfer_response_payload(status="Accepted")

    # --- Xử lý các lệnh từ Server (không phải từ trạm sạc, nhưng để đây cho đầy đủ) ---
    elif action == "ClearCache":
        response_payload = clear_cache_response_payload(status="Accepted")
    
    elif action == "ChangeConfiguration":
        key = payload.get('key')
        value = payload.get('value')
        if key in mock_configuration:
            if not mock_configuration[key]['readonly']:
                mock_configuration[key]['value'] = value
                response_payload = change_configuration_response_payload(status="Accepted")
                print(f"[Python] Config '{key}' changed to '{value}'", file=sys.stderr)
            else:
                response_payload = change_configuration_response_payload(status="Rejected") # Không cho thay đổi key readonly
        else:
            response_payload = change_configuration_response_payload(status="NotSupported")

    elif action == "GetConfiguration":
        requested_keys = payload.get('key', [])
        
        # Nếu không có key nào được yêu cầu, trả về tất cả
        if not requested_keys:
            requested_keys = mock_configuration.keys()
            
        config_keys = []
        unknown_keys = []
        
        for k in requested_keys:
            if k in mock_configuration:
                config_keys.append({
                    'key': k,
                    'readonly': mock_configuration[k]['readonly'],
                    'value': mock_configuration[k]['value']
                })
            else:
                unknown_keys.append(k)
        
        response_payload = get_configuration_response_payload(config_keys, unknown_keys)

    else:
        print(f"[Python] Action không được hỗ trợ: {action}", file=sys.stderr)
        return [4, unique_id, "NotSupported", "Action not supported", {}]

    # Tạo thông điệp phản hồi hoàn chỉnh
    response_msg = create_call_result_message(unique_id, response_payload)
    print(f"[Python DEBUG] Chuẩn bị gửi phản hồi cho '{action}': {json.dumps(response_msg)}", file=sys.stderr)
    return response_msg

def main_loop():
    for line in sys.stdin:
        try:
            msg = json.loads(line)
            message_type_id, unique_id, action, payload = msg

            if message_type_id == 2: # Chỉ xử lý CALL message
                response_msg = handle_request(action, payload, unique_id)
                print(json.dumps(response_msg))
                sys.stdout.flush()

        except (json.JSONDecodeError, ValueError):
            print("[Python ERROR] Dữ liệu nhận được không phải là JSON hợp lệ.", file=sys.stderr)
        except Exception as e:
            print(f"[Python ERROR] Lỗi không xác định: {e}", file=sys.stderr)

if __name__ == "__main__":
    print("[Python] Handler đã sẵn sàng nhận dữ liệu.", file=sys.stderr)
    main_loop()
