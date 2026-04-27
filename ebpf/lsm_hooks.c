/*
 * Tetragon LSM Hook Program (BCC Native Version)
 * Real-time security enforcement using Linux Security Module hooks.
 */

#include <linux/types.h>
#include <linux/sched.h>
#include <linux/fs.h>
#include <linux/security.h>
#include <linux/binfmts.h> 

/* ============================================================================
 * BPF MAPS
 * ============================================================================
 */
BPF_RINGBUF_OUTPUT(events, 256);

struct policy_rule {
    char target_path_str; 
    __u32 action; 
};

BPF_ARRAY(blocked_paths, struct policy_rule, 100);
BPF_ARRAY(blocked_capabilities, __u32, 64);
BPF_ARRAY(config_map, __u32, 10);

#define EPERM 1
#define MAX_RULES 10
#define MAX_STR_LEN 64

/* ============================================================================
 * EVENT STRUCTURES
 * ============================================================================
 */
struct file_access_event {
    __u64 timestamp_ns;
    __u32 pid;
    __u32 uid;
    __u32 gid;
    __u8 event_type;      
    __u8 action;          
    char filepath;   
    char comm;        
};

struct capability_event {
    __u64 timestamp_ns;
    __u32 pid;
    __u32 uid;
    __u32 cap;
    __u8 action;
    char comm;        
};

struct exec_event {
    __u64 timestamp_ns;
    __u32 pid;
    __u32 ppid;
    __u32 uid;
    char filename;   
    char args;       
    __u8 action;
    char comm;        
};

/* ============================================================================
 * UTILITY FUNCTIONS
 * ============================================================================
 */

static __always_inline void get_current_task_info(__u32 *pid, __u32 *uid, __u32 *gid) {
    __u64 uid_gid = bpf_get_current_uid_gid();
    __u64 pid_tgid = bpf_get_current_pid_tgid();
    *pid = pid_tgid >> 32;
    *uid = uid_gid & 0xFFFFFFFF;
    *gid = uid_gid >> 32;
}

static __always_inline int is_path_blocked(const char *filepath) {
    #pragma unroll
    for (__u32 i = 0; i < MAX_RULES; i++) {
        struct policy_rule *entry = blocked_paths.lookup(&i);
        if (!entry) continue;
        if (entry->action == 0) break;
        
        int match = 1;
        #pragma unroll
        for (int j = 0; j < MAX_STR_LEN; j++) {
            if (entry->target_path_str[j] == '\0') break;
            if (filepath[j] != entry->target_path_str[j]) {
                match = 0;
                break;
            }
        }
        if (match) return 1;
    }
    return 0;
}

static __always_inline void submit_event(void *data, __u32 size) {
    events.ringbuf_output(data, size, 0);
}

/* ============================================================================
 * LSM HOOK: FILE OPEN
 * ============================================================================
 */
LSM_PROBE(file_open, struct file *file) {
    struct dentry *dentry = file->f_path.dentry;
    if (!dentry) return 0; 
    
    struct inode *inode = dentry->d_inode;
    if (!inode) return 0;
    
    __u32 pid, uid, gid;
    get_current_task_info(&pid, &uid, &gid);
    
    struct file_access_event event = {};
    event.timestamp_ns = bpf_ktime_get_ns();
    event.pid = pid;
    event.uid = uid;
    event.gid = gid;
    event.event_type = 1; 
    
    bpf_get_current_comm(&event.comm, sizeof(event.comm));
    
    const char *f = (const char *)file->f_path.dentry->d_name.name;
    if (f) {
        bpf_probe_read_kernel_str(event.filepath, sizeof(event.filepath), f);
    }
    
    if (is_path_blocked(event.filepath)) {
        event.action = 1; 
        submit_event(&event, sizeof(event));
        return -EPERM; 
    }
    
    event.action = 0; 
    
    /* 100% Safe Substring Check: Bypasses .rodata and nested loops */
    int is_sensitive = 0;
    #pragma unroll
    for (int i = 0; i < 64; i++) {
        if (event.filepath[i] == '\0') break;
        if (i < 60 && event.filepath[i] == '/' && event.filepath[i+1] == 'e' && event.filepath[i+2] == 't' && event.filepath[i+3] == 'c' && event.filepath[i+4] == '/') is_sensitive = 1;
        if (i < 59 && event.filepath[i] == '/' && event.filepath[i+1] == 'r' && event.filepath[i+2] == 'o' && event.filepath[i+3] == 'o' && event.filepath[i+4] == 't' && event.filepath[i+5] == '/') is_sensitive = 1;
        if (i < 61 && event.filepath[i] == '.' && event.filepath[i+1] == 'e' && event.filepath[i+2] == 'n' && event.filepath[i+3] == 'v') is_sensitive = 1;
    }

    if (is_sensitive) {
        submit_event(&event, sizeof(event));
    }
    
    return 0;
}

/* ============================================================================
 * LSM HOOK: CAPABILITY CHECK
 * ============================================================================
 */
LSM_PROBE(capable, const struct cred *cred, struct user_namespace *ns, int cap, int opts) {
    __u32 pid, uid, gid;
    get_current_task_info(&pid, &uid, &gid);
    
    __u32 map_key = cap;
    __u32 *blocked = blocked_capabilities.lookup(&map_key);
    
    if (blocked && *blocked == 1) {
        struct capability_event event = {};
        event.timestamp_ns = bpf_ktime_get_ns();
        event.pid = pid;
        event.uid = uid;
        event.cap = cap;
        event.action = 1; 
        
        bpf_get_current_comm(&event.comm, sizeof(event.comm));
        submit_event(&event, sizeof(event));
        
        return -EPERM; 
    }
    return 0; 
}

/* ============================================================================
 * LSM HOOK: PROGRAM EXECUTION CHECK
 * ============================================================================
 */
LSM_PROBE(bprm_check_security, struct linux_binprm *bprm) {
    __u32 pid, uid, gid;
    get_current_task_info(&pid, &uid, &gid);
    
    struct exec_event event = {};
    event.timestamp_ns = bpf_ktime_get_ns();
    event.pid = pid;
    event.uid = uid;
    event.ppid = 0; 
    event.action = 0;
    
    bpf_get_current_comm(&event.comm, sizeof(event.comm));
    
    if (bprm->filename) {
        bpf_probe_read_kernel_str(event.filename, sizeof(event.filename), bprm->filename);
    }
    
    /* 100% Safe Substring Check: Bypasses .rodata and nested loops */
    int is_suspicious = 0;
    #pragma unroll
    for (int i = 0; i < 64; i++) {
        if (event.filename[i] == '\0') break;
        
        if (i < 63 && event.filename[i] == 'n' && event.filename[i+1] == 'c') is_suspicious = 1;
        if (i < 60 && event.filename[i] == 's' && event.filename[i+1] == 'o' && event.filename[i+2] == 'c' && event.filename[i+3] == 'a' && event.filename[i+4] == 't') is_suspicious = 1;
        if (i < 60 && event.filename[i] == '/' && event.filename[i+1] == 't' && event.filename[i+2] == 'm' && event.filename[i+3] == 'p' && event.filename[i+4] == '/') is_suspicious = 1;
        if (i < 56 && event.filename[i] == '/' && event.filename[i+1] == 'd' && event.filename[i+2] == 'e' && event.filename[i+3] == 'v' && event.filename[i+4] == '/' && event.filename[i+5] == 's' && event.filename[i+6] == 'h' && event.filename[i+7] == 'm' && event.filename[i+8] == '/') is_suspicious = 1;
    }

    if (is_suspicious) {
        event.action = 1; 
        submit_event(&event, sizeof(event));
    } else {
        event.action = 0; 
        submit_event(&event, sizeof(event));
    }
    
    return 0; 
}

/* ============================================================================
 * DEBUG/TEST HOOK
 * ============================================================================
 */
TRACEPOINT_PROBE(syscalls, sys_enter_openat) {
    return 0;
}