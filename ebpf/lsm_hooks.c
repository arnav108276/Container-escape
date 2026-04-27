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
#define EPERM 1
#define MAX_RULES 10
#define MAX_STR_LEN 64

BPF_RINGBUF_OUTPUT(events, 256);

struct policy_rule {
    char target_path_str[MAX_STR_LEN]; // Changed from char to char array
    __u32 action; 
};

BPF_ARRAY(blocked_paths, struct policy_rule, 100);
BPF_ARRAY(blocked_capabilities, __u32, 64);
BPF_ARRAY(config_map, __u32, 10);


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
    char filepath[MAX_STR_LEN]; // Changed to array
    char comm;              // Changed to array (16 is TASK_COMM_LEN)
};

struct capability_event {
    __u64 timestamp_ns;
    __u32 pid;
    __u32 uid;
    __u32 cap;
    __u8 action;
    char comm;              // Changed to array
};

struct exec_event {
    __u64 timestamp_ns;
    __u32 pid;
    __u32 ppid;
    __u32 uid;
    char filename[MAX_STR_LEN];  // Changed to array
    char args;             // Changed to array (increased size for args)
    __u8 action;
    char comm;              // Changed to array
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
        __u32 key = i;
        struct policy_rule *entry = blocked_paths.lookup(&key);
        
        if (!entry) continue;
        if (entry->action == 0) continue; 
        
        int match = 1;
        
        // Flattened comparison to satisfy the verifier
        if (entry->target_path_str != '\0' && filepath != entry->target_path_str) match = 0;
        if (match && entry->target_path_str != '\0' && filepath != entry->target_path_str) match = 0;
        if (match && entry->target_path_str != '\0' && filepath != entry->target_path_str) match = 0;
        if (match && entry->target_path_str != '\0' && filepath != entry->target_path_str) match = 0;
        if (match && entry->target_path_str != '\0' && filepath != entry->target_path_str) match = 0;
        if (match && entry->target_path_str != '\0' && filepath != entry->target_path_str) match = 0;
        if (match && entry->target_path_str != '\0' && filepath != entry->target_path_str) match = 0;
        if (match && entry->target_path_str != '\0' && filepath != entry->target_path_str) match = 0;
        if (match && entry->target_path_str != '\0' && filepath != entry->target_path_str) match = 0;
        if (match && entry->target_path_str != '\0' && filepath != entry->target_path_str) match = 0;
        if (match && entry->target_path_str != '\0' && filepath != entry->target_path_str) match = 0;
        if (match && entry->target_path_str != '\0' && filepath != entry->target_path_str) match = 0;
        if (match && entry->target_path_str != '\0' && filepath != entry->target_path_str) match = 0;
        if (match && entry->target_path_str != '\0' && filepath != entry->target_path_str) match = 0;
        if (match && entry->target_path_str != '\0' && filepath != entry->target_path_str) match = 0;
        if (match && entry->target_path_str != '\0' && filepath != entry->target_path_str) match = 0;

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
    /* Direct Prefix Check: Bypasses .rodata and loops */
    int is_sensitive = 0;

    // Check for "/etc/"
    if (event.filepath == '/' && event.filepath == 'e' && 
        event.filepath == 't' && event.filepath == 'c' && 
        event.filepath == '/') {
        is_sensitive = 1;
    }
    // Check for "/root/"
    else if (event.filepath == '/' && event.filepath == 'r' && 
             event.filepath == 'o' && event.filepath == 'o' && 
             event.filepath == 't' && event.filepath == '/') {
        is_sensitive = 1;
    }
    // Check for ".env"
    else if (event.filepath == '.' && event.filepath == 'e' && 
             event.filepath == 'n' && event.filepath == 'v') {
        is_sensitive = 1;
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
    
    bpf_get_current_comm(&event.comm, sizeof(event.comm));
    
    if (bprm->filename) {
        bpf_probe_read_kernel_str(event.filename, sizeof(event.filename), bprm->filename);
    }
    
    /* Direct Prefix Check: We removed the loop and the #pragma unroll */
    int is_suspicious = 0;

    // Check for "nc"
    if (event.filename == 'n' && event.filename == 'c' && event.filename == '\0') {
        is_suspicious = 1;
    }
    // Check for "socat"
    else if (event.filename == 's' && event.filename == 'o' && 
             event.filename == 'c' && event.filename == 'a' && 
             event.filename == 't' && event.filename == '\0') {
        is_suspicious = 1;
    }
    // Check for "/tmp/"
    else if (event.filename == '/' && event.filename == 't' && 
             event.filename == 'm' && event.filename == 'p' && 
             event.filename == '/') {
        is_suspicious = 1;
    }
    // Check for "/dev/shm/"
    else if (event.filename == '/' && event.filename == 'd' && 
             event.filename == 'e' && event.filename == 'v' && 
             event.filename == '/' && event.filename == 's' &&
             event.filename == 'h' && event.filename == 'm' && 
             event.filename == '/') {
        is_suspicious = 1;
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