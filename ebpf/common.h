#ifndef __COMMON_H__
#define __COMMON_H__

#include <linux/types.h>

/* Maximum string lengths */
#define MAX_FILENAME_LEN 256
#define MAX_CONTAINER_ID_LEN 64

/* Event types */
#define EVENT_PRIVILEGE_ESCALATION 1
#define EVENT_UNAUTHORIZED_FILE_ACCESS 2
#define EVENT_MOUNT_ATTEMPT 3
#define EVENT_EXEC 4
#define EVENT_CAP_CHANGE 5
#define EVENT_PROCESS_TRACING 6

/* Risk levels */
#define RISK_LOW 1
#define RISK_MEDIUM 2
#define RISK_HIGH 3
#define RISK_CRITICAL 4

/* Event structure passed to user space */
struct security_event {
    __u64 timestamp_ns;
    __u32 pid;
    __u32 uid;
    __u32 gid;
    __u32 event_type;
    __u32 risk_level;
    char container_id[MAX_CONTAINER_ID_LEN];
    char filepath[MAX_FILENAME_LEN];
    __u32 syscall_nr;
    __u32 syscall_arg0;
    __u32 syscall_arg1;
    __u32 syscall_arg2;
    __u32 syscall_arg3;
};

#endif /* __COMMON_H__ */
